import tempfile
import unittest
from pathlib import Path

import httpx
import numpy as np
import xarray as xr

from .hycom import HycomQuery, discover_latest_hycom, process_hycom


def hycom_fixture():
    shape = (2, 2, 3, 3)
    temperature = np.arange(np.prod(shape), dtype=float).reshape(shape) + 20
    return xr.Dataset(
        {
            'TEMP': (('TIME', 'DEPTH', 'LAT', 'LON'), temperature, {'units': 'degC'}),
            'SALN': (('TIME', 'DEPTH', 'LAT', 'LON'), np.full(shape, 35.0), {'units': 'PSU'}),
            'UVEL': (('TIME', 'DEPTH', 'LAT', 'LON'), np.full(shape, 0.3), {'units': 'm/s'}),
            'VVEL': (('TIME', 'DEPTH', 'LAT', 'LON'), np.full(shape, 0.4), {'units': 'm/s'}),
        },
        coords={
            'TIME': np.array(['2026-09-15', '2026-09-16'], dtype='datetime64[ns]'),
            'DEPTH': ('DEPTH', [0.0, 100.0], {'units': 'm', 'positive': 'down'}),
            'LAT': [5.0, 10.0, 15.0],
            'LON': [75.0, 80.0, 85.0],
        },
    )


class HycomAdapterTests(unittest.TestCase):
    def test_local_opendap_shaped_fixture_normalizes_to_browser_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'RSMC_hycom_20260915.nc'
            hycom_fixture().to_netcdf(path)
            result = process_hycom(
                {
                    'filename': path.name,
                    'cycle': '2026-09-15T00:00:00Z',
                    'opendapUrl': str(path),
                    'downloadPage': 'fixture',
                },
                HycomQuery(west=75, south=5, east=85, north=15),
            )
        self.assertFalse(result['synthetic'])
        self.assertEqual(result['forecastCycle'], '2026-09-15T00:00:00Z')
        self.assertEqual(result['grid']['depth'], [0.0, 100.0])
        self.assertAlmostEqual(result['grid']['fields']['u'][0], 0.3)
        self.assertAlmostEqual(result['grid']['fields']['v'][0], 0.4)
        speed = next(item for item in result['variables'] if item['id'] == 'speed')
        self.assertAlmostEqual(speed['max'], 0.5)


class HycomDiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_selects_latest_cycle(self):
        def handler(_request: httpx.Request):
            return httpx.Response(200, text='RSMC_hycom_20260914.nc RSMC_hycom_20260916.nc')

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            reference = await discover_latest_hycom(client)
        self.assertEqual(reference['filename'], 'RSMC_hycom_20260916.nc')
        self.assertTrue(reference['opendapUrl'].endswith(reference['filename']))


if __name__ == '__main__':
    unittest.main()
