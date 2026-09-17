"""Bounded RSMC WaveWatch III discovery and OPeNDAP processing adapter."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import re
from typing import Any

import httpx
import numpy as np
import xarray as xr

DOWNLOAD_PAGE = 'https://incois.gov.in/oceanservices/rsmc_download.jsp'
OPENDAP_ROOT = 'https://incois.gov.in/thredds/dodsC/osf/ww3'
PROCESSING_VERSION = 'ww3-opendap-1.0.0'
FILENAME = re.compile(r'rsmc_combined_ww3_(\d{8})\.nc', re.IGNORECASE)
LIMITS = {'time': 12, 'latitude': 48, 'longitude': 56}
VARIABLES = {
    'wave_height': ('HS', 'Significant wave height', 'm', 'sea_surface_wave_significant_height'),
    'wave_period': ('PWP', 'Peak wave period', 's', 'sea_surface_wave_period_at_variance_spectral_density_maximum'),
    'wave_direction': ('MWD', 'Mean wave direction', '°', 'sea_surface_wave_from_direction'),
    'wind_speed': (None, 'Wind speed', 'm/s', 'wind_speed'),
}


@dataclass(frozen=True)
class Ww3Query:
    west: float = 65
    south: float = 0
    east: float = 100
    north: float = 28

    def validate(self) -> None:
        if not (-180 <= self.west < self.east <= 180):
            raise ValueError('Longitude bounds must be ordered within -180..180.')
        if not (-85 <= self.south < self.north <= 85):
            raise ValueError('Latitude bounds must be ordered within -85..85.')
        if (self.east - self.west) * (self.north - self.south) > 2_500:
            raise ValueError('Requested WW3 region is too large for an interactive subset.')


async def discover_latest_ww3(client: httpx.AsyncClient) -> dict[str, Any]:
    response = await client.get(DOWNLOAD_PAGE)
    response.raise_for_status()
    matches = FILENAME.findall(response.text)
    if not matches:
        raise ValueError('The RSMC download page did not list a WW3 cycle.')
    cycle_text = max(matches)
    cycle = datetime.strptime(cycle_text, '%Y%m%d').replace(tzinfo=timezone.utc)
    filename = f'rsmc_combined_ww3_{cycle_text}.nc'
    return {
        'filename': filename,
        'cycle': cycle.isoformat().replace('+00:00', 'Z'),
        'opendapUrl': f'{OPENDAP_ROOT}/{filename}',
        'downloadPage': DOWNLOAD_PAGE,
    }


def _time_text(value: Any) -> str:
    if isinstance(value, np.datetime64):
        return str(np.datetime_as_string(value, unit='s')) + 'Z'
    return value.strftime('%Y-%m-%dT%H:%M:%SZ')


def process_ww3(reference: dict[str, Any], query: Ww3Query) -> dict[str, Any]:
    query.validate()
    with xr.open_dataset(reference['opendapUrl'], decode_cf=True) as source:
        dataset = source.rename({'IOXAXIS': 'longitude', 'IOYAXIS': 'latitude', 'TIME': 'time'})
        dataset = dataset.assign_coords(longitude=((dataset.longitude.astype(float) + 180) % 360) - 180)
        dataset = dataset.sortby(['time', 'latitude', 'longitude']).sel(
            longitude=slice(query.west, query.east),
            latitude=slice(query.south, query.north),
        )
        if dataset.sizes.get('time', 0) < 1 or dataset.sizes.get('latitude', 0) < 2 or dataset.sizes.get('longitude', 0) < 2:
            raise ValueError('The WW3 cycle has no usable values in the selected region.')
        dataset = dataset.isel({
            key: slice(0, None, max(1, math.ceil(dataset.sizes[key] / limit)))
            for key, limit in LIMITS.items()
        })
        arrays: dict[str, np.ndarray] = {
            'wave_height': dataset['HS'].transpose('time', 'latitude', 'longitude').values.astype(float),
            'wave_period': dataset['PWP'].transpose('time', 'latitude', 'longitude').values.astype(float),
            'wave_direction': dataset['MWD'].transpose('time', 'latitude', 'longitude').values.astype(float),
        }
        u = dataset['UWND'].transpose('time', 'latitude', 'longitude').values.astype(float)
        v = dataset['VWND'].transpose('time', 'latitude', 'longitude').values.astype(float)
        arrays['wind_speed'] = np.hypot(u, v)
        fields: dict[str, list[float | None]] = {}
        variables = []
        for identifier, array in arrays.items():
            finite = array[np.isfinite(array)]
            if finite.size == 0:
                continue
            fields[identifier] = [float(value) if np.isfinite(value) else None for value in array.ravel()]
            _, label, unit, standard_name = VARIABLES[identifier]
            low, high = float(finite.min()), float(finite.max())
            variables.append({
                'id': identifier, 'label': label, 'unit': unit,
                'standardName': standard_name, 'min': low,
                'max': high if high > low else low + 1,
            })
        fields['wind_u'] = [float(value) if np.isfinite(value) else None for value in u.ravel()]
        fields['wind_v'] = [float(value) if np.isfinite(value) else None for value in v.ravel()]
        latitude = dataset.latitude.values.astype(float).tolist()
        longitude = dataset.longitude.values.astype(float).tolist()
        times = [_time_text(value) for value in dataset.time.values]
    if not fields:
        raise ValueError('The WW3 cycle contains no finite wave or wind values.')
    return {
        'name': f"RSMC WW3 · {reference['cycle'][:10]}",
        'source': f"INCOIS RSMC WaveWatch III via bounded OPeNDAP; immutable source: {reference['opendapUrl']}",
        'synthetic': False,
        'variables': variables,
        'grid': {
            'latitude': latitude, 'longitude': longitude, 'depth': [0.0],
            'time': times, 'fields': fields,
        },
        'observations': [],
        'sourceDatasetVersion': reference['filename'],
        'processingVersion': PROCESSING_VERSION,
        'forecastCycle': reference['cycle'],
        'sourceState': 'live',
        'stale': False,
        'query': {
            'west': query.west, 'south': query.south,
            'east': query.east, 'north': query.north,
        },
        'normalizations': [
            'HS interpreted as significant wave height in metres from the RSMC product contract',
            'PWP interpreted as peak wave period in seconds from the RSMC product contract',
            'MWD interpreted as mean wave direction in degrees from the RSMC product contract',
            'Wind speed derived explicitly as hypot(UWND, VWND)',
            'UWND and VWND retained as wind_u/wind_v for directional particle advection',
        ],
    }
