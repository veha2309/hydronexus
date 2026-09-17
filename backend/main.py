"""Run: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"""
import os
import hmac
import tempfile
import asyncio
from datetime import datetime
from pathlib import Path
import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from .argo import ArgoQuery, fetch_argo
from .convert import convert
from .hycom import HycomQuery, discover_latest_hycom, process_hycom
from .ww3 import Ww3Query, discover_latest_ww3, process_ww3
from .storage import ArtifactStore

app = FastAPI(title='HydroNexus Data Service', version='0.1.0')
origins = os.getenv('HYDRONEXUS_ALLOWED_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000').split(',')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET','POST'], allow_headers=['Content-Type'])

@app.get('/health')
def health():
    return {'status':'ok','service':'HydroNexus xarray ingestion','max_upload_mb':25}

def require_service_token(token: str | None):
    expected = os.getenv('HYDRONEXUS_SERVICE_TOKEN')
    if expected and (not token or not hmac.compare_digest(token, expected)):
        raise HTTPException(401, 'Service authentication failed.')


class WorkspaceSubsetRequest(BaseModel):
    sources: list[str] = Field(default_factory=lambda: ['rsmc-hycom', 'rsmc-ww3'], min_length=1, max_length=4)
    west: float = Field(65, ge=-180, lt=180)
    south: float = Field(0, ge=-85, lt=85)
    east: float = Field(100, gt=-180, le=180)
    north: float = Field(28, gt=-85, le=85)
    variables: list[str] | None = Field(default=None, max_length=20)
    time_start: datetime | None = None
    time_end: datetime | None = None
    depth_min: float | None = Field(default=None, ge=0, le=12000)
    depth_max: float | None = Field(default=None, ge=0, le=12000)
    max_time_steps: int = Field(12, ge=1, le=24)
    max_depth_levels: int = Field(12, ge=1, le=20)


def _bounded_indices(indices: list[int], limit: int) -> list[int]:
    if len(indices) <= limit:
        return indices
    if limit == 1:
        return [indices[0]]
    return [indices[round(position * (len(indices) - 1) / (limit - 1))] for position in range(limit)]


def _slice_layer(result: dict, request: WorkspaceSubsetRequest) -> dict:
    """Trim a normalized layer without interpolating or changing source values."""
    grid = result.get('grid')
    if not isinstance(grid, dict):
        return result
    times, depths = grid['time'], grid['depth']
    time_indices = [
        index for index, value in enumerate(times)
        if (request.time_start is None or datetime.fromisoformat(value.replace('Z', '+00:00')) >= request.time_start)
        and (request.time_end is None or datetime.fromisoformat(value.replace('Z', '+00:00')) <= request.time_end)
    ]
    depth_indices = [
        index for index, value in enumerate(depths)
        if (request.depth_min is None or value >= request.depth_min)
        and (request.depth_max is None or value <= request.depth_max)
    ]
    if not time_indices or not depth_indices:
        raise ValueError('The requested time/depth slice does not overlap this layer.')
    time_indices = _bounded_indices(time_indices, request.max_time_steps)
    depth_indices = _bounded_indices(depth_indices, request.max_depth_levels)
    requested = set(request.variables or [])
    variables = result.get('variables', [])
    if requested:
        variables = [item for item in variables if item.get('id') in requested]
        if not variables:
            raise ValueError('None of the requested variables are available in this layer.')
    identifiers = {item['id'] for item in variables}
    field_ids = set(identifiers)
    if 'speed' in identifiers:
        field_ids.update({'u', 'v'})
    if 'wind_speed' in identifiers or 'wave_height' in identifiers:
        field_ids.update({'wind_u', 'wind_v', 'wave_period', 'wave_direction'})
    nt, nd = len(times), len(depths)
    ny, nx = len(grid['latitude']), len(grid['longitude'])
    plane = ny * nx
    fields = {}
    for identifier, values in grid['fields'].items():
        if requested and identifier not in field_ids:
            continue
        selected = []
        for time_index in time_indices:
            for depth_index in depth_indices:
                start = (time_index * nd + depth_index) * plane
                selected.extend(values[start:start + plane])
        fields[identifier] = selected
    sliced = dict(result)
    sliced['variables'] = variables
    sliced['grid'] = {
        **grid,
        'time': [times[index] for index in time_indices],
        'depth': [depths[index] for index in depth_indices],
        'fields': fields,
    }
    sliced['serverSlice'] = {
        'timeSteps': len(time_indices),
        'depthLevels': len(depth_indices),
        'variables': [item['id'] for item in variables],
        'interpolated': False,
    }
    return sliced


async def _workspace_layer(source: str, request: WorkspaceSubsetRequest, store: ArtifactStore):
    if source == 'rsmc-hycom':
        query = HycomQuery(request.west, request.south, request.east, request.north)
        discover, process = discover_latest_hycom, process_hycom
    elif source == 'rsmc-ww3':
        query = Ww3Query(request.west, request.south, request.east, request.north)
        discover, process = discover_latest_ww3, process_ww3
    else:
        raise ValueError(f'Unsupported workspace source: {source}')
    query.validate()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, read=90), follow_redirects=True
        ) as client:
            reference = await discover(client)
        result = await run_in_threadpool(process, reference, query)
        result['layerId'] = source
        result['artifacts'] = {
            'rawReference': await run_in_threadpool(
                store.put_json, 'raw-reference', source, reference
            ),
            'processed': await run_in_threadpool(
                store.put_json, 'processed', source, result
            ),
        }
        return _slice_layer(result, request)
    except (httpx.HTTPError, OSError, RuntimeError, ValueError):
        cached = await run_in_threadpool(store.latest_json, 'processed', source)
        if cached is None:
            raise
        cached['layerId'] = source
        cached['sourceState'] = 'stale-cache'
        cached['stale'] = True
        cached['staleReason'] = f'The live {source} product is unavailable.'
        return _slice_layer(cached, request)


@app.post('/v1/workspace/subset')
async def workspace_subset(
    request: WorkspaceSubsetRequest,
    x_hydronexus_service_token: str | None = Header(default=None),
):
    require_service_token(x_hydronexus_service_token)
    if request.west >= request.east or request.south >= request.north:
        raise HTTPException(422, 'Workspace bounds must be ordered west/east and south/north.')
    if any(value is not None and value.tzinfo is None for value in (request.time_start, request.time_end)):
        raise HTTPException(422, 'Workspace times must include a UTC offset.')
    if request.time_start and request.time_end and request.time_start > request.time_end:
        raise HTTPException(422, 'Workspace time bounds must be ordered.')
    if request.depth_min is not None and request.depth_max is not None and request.depth_min > request.depth_max:
        raise HTTPException(422, 'Workspace depth bounds must be ordered.')
    sources = list(dict.fromkeys(request.sources))
    if any(source not in {'rsmc-hycom', 'rsmc-ww3'} for source in sources):
        raise HTTPException(422, 'Only rsmc-hycom and rsmc-ww3 are currently available as gridded layers.')
    store = ArtifactStore()
    results = await asyncio.gather(
        *(_workspace_layer(source, request, store) for source in sources),
        return_exceptions=True,
    )
    layers, errors = [], []
    for source, result in zip(sources, results):
        if isinstance(result, Exception):
            errors.append({'source': source, 'error': 'No live or validated cached layer is available.'})
        else:
            layers.append(result)
    if not layers:
        raise HTTPException(502, 'No requested workspace layer could be prepared.')
    return {
        'workspaceVersion': '1.0.0',
        'query': request.model_dump(exclude={'sources'}, mode='json'),
        'layers': layers,
        'errors': errors,
        'partial': bool(errors),
    }

@app.get('/v1/sources')
def sources(x_hydronexus_service_token: str | None = Header(default=None)):
    require_service_token(x_hydronexus_service_token)
    return {'sources': [{
        'id': 'incois-argo',
        'provider': 'INCOIS',
        'dataset': 'Indian_ARGO_Floats',
        'status': 'active',
        'products': ['raw', 'qc-normalized', 'derived-depth'],
    }, {
        'id': 'rsmc-hycom',
        'provider': 'INCOIS',
        'dataset': 'RSMC HYCOM',
        'status': 'active',
        'products': ['raw-reference', 'bounded-normalized-subset'],
    }, {
        'id': 'rsmc-ww3',
        'provider': 'INCOIS',
        'dataset': 'RSMC WaveWatch III',
        'status': 'active',
        'products': ['raw-reference', 'bounded-normalized-surface-subset'],
    }]}

@app.get('/v1/ww3/latest')
async def ww3_latest(
    west: float = Query(65, ge=-180, lt=180),
    south: float = Query(0, ge=-85, lt=85),
    east: float = Query(100, gt=-180, le=180),
    north: float = Query(28, gt=-85, le=85),
    x_hydronexus_service_token: str | None = Header(default=None),
):
    require_service_token(x_hydronexus_service_token)
    query = Ww3Query(west, south, east, north)
    query.validate()
    store = ArtifactStore()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, read=90), follow_redirects=True
        ) as client:
            reference = await discover_latest_ww3(client)
        result = await run_in_threadpool(process_ww3, reference, query)
        raw_artifact = await run_in_threadpool(
            store.put_json, 'raw-reference', 'rsmc-ww3', reference
        )
        processed_artifact = await run_in_threadpool(
            store.put_json, 'processed', 'rsmc-ww3', result
        )
        result['artifacts'] = {
            'rawReference': raw_artifact,
            'processed': processed_artifact,
        }
        return result
    except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
        cached = await run_in_threadpool(
            store.latest_json, 'processed', 'rsmc-ww3'
        )
        if cached is not None:
            cached['sourceState'] = 'stale-cache'
            cached['stale'] = True
            cached['staleReason'] = 'The live RSMC WW3 cycle is unavailable.'
            return JSONResponse(
                cached,
                headers={
                    'Cache-Control': 'no-store',
                    'Warning': '110 - "RSMC unavailable; serving last processed WW3 subset"',
                },
            )
        raise HTTPException(
            502,
            'The live RSMC WW3 cycle could not be processed and no last-valid subset exists.',
        ) from error

@app.get('/v1/hycom/latest')
async def hycom_latest(
    west: float = Query(65, ge=-180, lt=180),
    south: float = Query(0, ge=-85, lt=85),
    east: float = Query(100, gt=-180, le=180),
    north: float = Query(28, gt=-85, le=85),
    x_hydronexus_service_token: str | None = Header(default=None),
):
    require_service_token(x_hydronexus_service_token)
    query = HycomQuery(west, south, east, north)
    query.validate()
    store = ArtifactStore()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, read=90), follow_redirects=True
        ) as client:
            reference = await discover_latest_hycom(client)
        result = await run_in_threadpool(process_hycom, reference, query)
        raw_artifact = await run_in_threadpool(
            store.put_json, 'raw-reference', 'rsmc-hycom', reference
        )
        processed_artifact = await run_in_threadpool(
            store.put_json, 'processed', 'rsmc-hycom', result
        )
        result['artifacts'] = {
            'rawReference': raw_artifact,
            'processed': processed_artifact,
        }
        return result
    except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
        cached = await run_in_threadpool(
            store.latest_json, 'processed', 'rsmc-hycom'
        )
        if cached is not None:
            cached['sourceState'] = 'stale-cache'
            cached['stale'] = True
            cached['staleReason'] = 'The live RSMC HYCOM cycle is unavailable.'
            return JSONResponse(
                cached,
                headers={
                    'Cache-Control': 'no-store',
                    'Warning': '110 - "RSMC unavailable; serving last processed HYCOM subset"',
                },
            )
        raise HTTPException(
            502,
            'The live RSMC HYCOM cycle could not be processed and no last-valid subset exists.',
        ) from error

@app.get('/v1/argo/profiles')
async def argo_profiles(
    west: float = Query(65, ge=-180, lt=180),
    south: float = Query(0, ge=-85, lt=85),
    east: float = Query(100, gt=-180, le=180),
    north: float = Query(28, gt=-85, le=85),
    start: datetime | None = None,
    end: datetime | None = None,
    max_profiles: int = Query(100, ge=1, le=250),
    x_hydronexus_service_token: str | None = Header(default=None),
):
    require_service_token(x_hydronexus_service_token)
    query = ArgoQuery(west, south, east, north, start, end, max_profiles)
    store = ArtifactStore()

    async def stale_or_error(detail: str, status: int):
        cached = await run_in_threadpool(
            store.latest_json, 'qc', 'incois-argo'
        )
        if cached is not None:
            cached['sourceState'] = 'stale-cache'
            cached['stale'] = True
            cached['staleReason'] = detail
            return JSONResponse(
                cached,
                headers={
                    'Cache-Control': 'no-store',
                    'Warning': '110 - "INCOIS unavailable; serving last valid QC artifact"',
                },
            )
        raise HTTPException(
            status,
            f'{detail} No previously validated Argo artifact is available.',
        )

    try:
        raw, normalized = await fetch_argo(query)
        normalized['sourceState'] = 'live'
        normalized['stale'] = False
        normalized['artifacts'] = {
            'raw': await run_in_threadpool(store.put_json, 'raw', 'incois-argo', raw),
            'qc': await run_in_threadpool(store.put_json, 'qc', 'incois-argo', normalized),
        }
        return normalized
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except (httpx.TimeoutException, httpx.NetworkError) as error:
        return await stale_or_error(
            'INCOIS ERDDAP is unreachable or its verified TLS connection failed.',
            502,
        )
    except httpx.HTTPStatusError as error:
        status = error.response.status_code
        if status == 404:
            raise HTTPException(404, 'No Argo observations matched this bounded query.') from error
        return await stale_or_error(
            f'INCOIS ERDDAP returned HTTP {status}.',
            503 if status == 503 else 502,
        )

@app.post('/ingest')
async def ingest(
    file: UploadFile = File(...),
    x_hydronexus_service_token: str | None = Header(default=None),
):
    require_service_token(x_hydronexus_service_token)
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in ('.nc', '.nc4'):
        raise HTTPException(400, 'Only NetCDF .nc and .nc4 files are supported here.')
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as target:
            path = Path(target.name)
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 25 * 1024 * 1024:
                    raise HTTPException(413, 'Upload exceeds 25 MB. Subset locally with convert.py.')
                target.write(chunk)
        result = await run_in_threadpool(convert, path)
        result['name'] = Path(file.filename or 'Imported model').name
        result['source'] = ('Synthetic demonstration' if result['synthetic'] else 'User-uploaded') + ' NetCDF, processed with xarray; no operational QC performed'
        return result
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
    finally:
        await file.close()
        if path is not None:
            path.unlink(missing_ok=True)
