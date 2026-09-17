"""Bounded INCOIS ERDDAP Argo adapter with explicit QC and provenance."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from typing import Any
from urllib.parse import quote

import httpx

ARGO_DATASET = 'Indian_ARGO_Floats'
ARGO_BASE_URL = 'https://erddap.incois.gov.in/erddap/tabledap'
PROCESSING_VERSION = 'argo-qc-1.0.0'
MAX_RESPONSE_BYTES = 25 * 1024 * 1024
VARIABLES = (
    'PLATFORM_NUMBER', 'CYCLE_NUMBER', 'DIRECTION', 'time', 'latitude',
    'longitude', 'PRES', 'PRES_QC', 'PRES_ADJUSTED', 'PRES_ADJUSTED_QC',
    'TEMP', 'TEMP_QC', 'TEMP_ADJUSTED', 'TEMP_ADJUSTED_QC', 'PSAL',
    'PSAL_QC', 'PSAL_ADJUSTED', 'PSAL_ADJUSTED_QC',
)


@dataclass(frozen=True)
class ArgoQuery:
    west: float = 65
    south: float = 0
    east: float = 100
    north: float = 28
    start: datetime | None = None
    end: datetime | None = None
    max_profiles: int = 100

    def validate(self) -> None:
        if not (-180 <= self.west < self.east <= 180):
            raise ValueError('Longitude bounds must be ordered within -180..180.')
        if not (-85 <= self.south < self.north <= 85):
            raise ValueError('Latitude bounds must be ordered within -85..85.')
        if (self.east - self.west) * (self.north - self.south) > 4_000:
            raise ValueError('Requested Argo region is too large; use a smaller bounding box.')
        if not 1 <= self.max_profiles <= 250:
            raise ValueError('max_profiles must be between 1 and 250.')
        if self.start and self.end:
            if self.start >= self.end:
                raise ValueError('start must be earlier than end.')
            if self.end - self.start > timedelta(days=45):
                raise ValueError('Argo requests are limited to 45 days.')


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def _url(query: ArgoQuery, start: datetime, end: datetime) -> str:
    constraints = [
        f'longitude>={query.west}', f'longitude<={query.east}',
        f'latitude>={query.south}', f'latitude<={query.north}',
        f'time>={_iso(start)}', f'time<={_iso(end)}',
    ]
    encoded = '&'.join(quote(item, safe='><=') for item in constraints)
    return f'{ARGO_BASE_URL}/{ARGO_DATASET}.json?{",".join(VARIABLES)}&{encoded}'


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or abs(number) >= 99_999:
        return None
    return number


def _flag(value: Any) -> str:
    return str(value or '').strip()


def _measurement(row: dict[str, Any], stem: str, uncertainty: tuple[float, float]):
    adjusted, adjusted_flag = _number(row.get(f'{stem}_ADJUSTED')), _flag(row.get(f'{stem}_ADJUSTED_QC'))
    raw, raw_flag = _number(row.get(stem)), _flag(row.get(f'{stem}_QC'))
    if adjusted is not None and adjusted_flag in {'1', '2'}:
        value, flag, source_flag, sigma = adjusted, adjusted_flag, 'adjusted', uncertainty[0]
    elif raw is not None and raw_flag in {'1', '2'}:
        value, flag, source_flag, sigma = raw, raw_flag, 'raw', uncertainty[1]
    else:
        return None
    return {
        'value': value,
        'qcFlag': flag,
        'sourceFlag': source_flag,
        'uncertainty': sigma * (2 if flag == '2' else 1),
        'isImputed': False,
        'imputationMethod': None,
        'sourceDatasetVersion': ARGO_DATASET,
        'processingVersion': PROCESSING_VERSION,
    }


def pressure_to_depth(pressure_dbar: float, latitude: float) -> float:
    """UNESCO 1983 pressure-to-depth approximation, metres positive down."""
    sine2 = math.sin(math.radians(latitude)) ** 2
    gravity = 9.780318 * (1 + (5.2788e-3 + 2.36e-5 * sine2) * sine2)
    gravity += 1.092e-6 * pressure_dbar
    numerator = (((-1.82e-15 * pressure_dbar + 2.279e-10) * pressure_dbar - 2.2512e-5) * pressure_dbar + 9.72659) * pressure_dbar
    return max(0.0, numerator / gravity)


def normalize_argo(payload: dict[str, Any], max_profiles: int = 100) -> dict[str, Any]:
    table = payload.get('table')
    if not isinstance(table, dict):
        raise ValueError('INCOIS returned an unexpected ERDDAP response.')
    columns, rows = table.get('columnNames'), table.get('rows')
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise ValueError('INCOIS ERDDAP response is missing columns or rows.')
    profiles: dict[str, dict[str, Any]] = {}
    rejected = 0
    for values in rows:
        if not isinstance(values, list) or len(values) != len(columns):
            rejected += 1
            continue
        row = dict(zip(columns, values))
        latitude, longitude = _number(row.get('latitude')), _number(row.get('longitude'))
        pressure = _measurement(row, 'PRES', (0.5, 1.0))
        if latitude is None or longitude is None or pressure is None:
            rejected += 1
            continue
        temperature = _measurement(row, 'TEMP', (0.01, 0.05))
        salinity = _measurement(row, 'PSAL', (0.01, 0.03))
        if temperature is None and salinity is None:
            rejected += 1
            continue
        platform = str(row.get('PLATFORM_NUMBER', '')).removesuffix('.0')
        cycle = int(_number(row.get('CYCLE_NUMBER')) or 0)
        direction = str(row.get('DIRECTION') or '').strip() or 'unknown'
        timestamp = str(row.get('time') or '')
        identifier = f'INCOIS-ARGO-{platform}-{cycle}-{direction}'
        profile = profiles.setdefault(identifier, {
            'id': identifier, 'kind': 'Argo', 'latitude': latitude,
            'longitude': longitude, 'time': timestamp,
            'source': 'INCOIS ERDDAP Indian_ARGO_Floats', 'points': [],
        })
        measurements = {'pressure': pressure}
        values_out: dict[str, float] = {}
        if temperature is not None:
            measurements['temperature'] = temperature
            values_out['temperature'] = temperature['value']
        if salinity is not None:
            measurements['salinity'] = salinity
            values_out['salinity'] = salinity['value']
        profile['points'].append({
            'depth': pressure_to_depth(pressure['value'], latitude),
            'values': values_out,
            'measurements': measurements,
            'depthDerivation': 'UNESCO-1983 pressure-to-depth',
        })
    ordered = sorted(profiles.values(), key=lambda item: item['time'], reverse=True)
    ordered = ordered[:max_profiles]
    for profile in ordered:
        profile['points'].sort(key=lambda point: point['depth'])
    return {
        'synthetic': False,
        'sourceDatasetVersion': ARGO_DATASET,
        'processingVersion': PROCESSING_VERSION,
        'observations': ordered,
        'qualitySummary': {
            'receivedRows': len(rows),
            'rejectedRows': rejected,
            'acceptedProfiles': len(ordered),
            'usesAdjustedValuesFirst': True,
            'acceptedProviderQcFlags': ['1', '2'],
        },
        'provenance': {
            'provider': 'INCOIS',
            'dataset': ARGO_DATASET,
            'access': 'ERDDAP tabledap',
            'retrievedAt': datetime.now(timezone.utc).isoformat(),
        },
    }


async def _latest_time(client: httpx.AsyncClient) -> datetime:
    url = f'{ARGO_BASE_URL}/{ARGO_DATASET}.json?time&orderByMax(%22time%22)'
    response = await _get_with_retry(client, url)
    rows = response.json().get('table', {}).get('rows', [])
    if not rows:
        raise ValueError('INCOIS ERDDAP did not report a latest Argo timestamp.')
    value = str(rows[0][0]).replace('Z', '+00:00')
    return datetime.fromisoformat(value)


async def _get_with_retry(client: httpx.AsyncClient, url: str):
    for attempt in range(3):
        try:
            response = await client.get(url)
            if response.status_code not in {502, 503, 504}:
                response.raise_for_status()
                return response
            response.raise_for_status()
        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError):
            if attempt == 2:
                raise
            await asyncio.sleep(0.5 * (2**attempt))
    raise RuntimeError('unreachable')


async def fetch_argo(query: ArgoQuery, client: httpx.AsyncClient | None = None):
    query.validate()
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(30, read=90), follow_redirects=True)
    try:
        end = query.end or await _latest_time(client)
        start = query.start or end - timedelta(days=14)
        if start >= end or end - start > timedelta(days=45):
            raise ValueError('Resolved Argo time range is invalid or exceeds 45 days.')
        response = await _get_with_retry(client, _url(query, start, end))
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ValueError('INCOIS response exceeded the 25 MB adapter limit.')
        raw = response.json()
        normalized = normalize_argo(raw, query.max_profiles)
        normalized['query'] = {
            'west': query.west, 'south': query.south, 'east': query.east,
            'north': query.north, 'start': _iso(start), 'end': _iso(end),
            'maxProfiles': query.max_profiles,
        }
        return raw, normalized
    finally:
        if owns_client:
            await client.aclose()
