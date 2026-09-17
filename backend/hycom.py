"""Bounded RSMC HYCOM discovery and OPeNDAP processing adapter."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any

import httpx
import xarray as xr

from .convert import normalize

DOWNLOAD_PAGE = 'https://incois.gov.in/oceanservices/rsmc_download.jsp'
OPENDAP_ROOT = 'https://incois.gov.in/thredds/dodsC/osf/currents2'
PROCESSING_VERSION = 'hycom-opendap-1.0.0'
FILENAME = re.compile(r'RSMC_hycom_(\d{8})\.nc', re.IGNORECASE)


@dataclass(frozen=True)
class HycomQuery:
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
            raise ValueError('Requested HYCOM region is too large for an interactive subset.')


async def discover_latest_hycom(client: httpx.AsyncClient) -> dict[str, Any]:
    response = await client.get(DOWNLOAD_PAGE)
    response.raise_for_status()
    matches = FILENAME.findall(response.text)
    if not matches:
        raise ValueError('The RSMC download page did not list a HYCOM cycle.')
    cycle_text = max(matches)
    cycle = datetime.strptime(cycle_text, '%Y%m%d').replace(tzinfo=timezone.utc)
    filename = f'RSMC_hycom_{cycle_text}.nc'
    return {
        'filename': filename,
        'cycle': cycle.isoformat().replace('+00:00', 'Z'),
        'opendapUrl': f'{OPENDAP_ROOT}/{filename}',
        'downloadPage': DOWNLOAD_PAGE,
    }


def process_hycom(reference: dict[str, Any], query: HycomQuery):
    query.validate()
    with xr.open_dataset(reference['opendapUrl'], decode_cf=True) as dataset:
        # The RSMC file omits these unit attributes. They are defined by the
        # provider's HYCOM product documentation and are scoped to this adapter.
        dataset['TEMP'].attrs.setdefault('units', 'degC')
        dataset['SALN'].attrs.setdefault('units', 'PSU')
        dataset['DEPTH'].attrs.setdefault('units', 'm')
        result = normalize(
            dataset,
            reference['filename'],
            [query.west, query.south, query.east, query.north],
        )
    result.update({
        'name': f"RSMC HYCOM · {reference['cycle'][:10]}",
        'source': (
            'INCOIS RSMC HYCOM via bounded OPeNDAP; raw source remains '
            f"immutable at {reference['opendapUrl']}"
        ),
        'synthetic': False,
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
            'TEMP unit supplied from RSMC product contract: degC',
            'SALN unit supplied from RSMC product contract: PSU',
            'DEPTH unit supplied from RSMC product contract: m positive down',
        ],
    })
    return result
