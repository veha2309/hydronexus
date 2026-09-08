"""Run: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"""
import os
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from .convert import convert

app = FastAPI(title='HydroNexus Data Service', version='0.1.0')
origins = os.getenv('HYDRONEXUS_ALLOWED_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000').split(',')
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET','POST'], allow_headers=['Content-Type'])

@app.get('/health')
def health():
    return {'status':'ok','service':'HydroNexus xarray ingestion','max_upload_mb':25}

@app.post('/ingest')
async def ingest(file: UploadFile = File(...)):
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
