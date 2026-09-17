import tempfile
import unittest
from pathlib import Path

import httpx
import numpy as np
import xarray as xr

from .ww3 import Ww3Query, discover_latest_ww3, process_ww3


def ww3_fixture():
    shape = (2, 3, 3)
    return xr.Dataset(
        {
            'HS': (('TIME', 'IOYAXIS', 'IOXAXIS'), np.full(shape, 2.5)),
            'PWP': (('TIME', 'IOYAXIS', 'IOXAXIS'), np.full(shape, 11.0)),
            'MWD': (('TIME', 'IOYAXIS', 'IOXAXIS'), np.full(shape, 225.0)),
            'UWND': (('TIME', 'IOYAXIS', 'IOXAXIS'), np.full(shape, 3.0)),
            'VWND': (('TIME', 'IOYAXIS', 'IOXAXIS'), np.full(shape, 4.0)),
        },
        coords={
            'TIME': np.array(['2026-09-16', '2026-09-17'], dtype='datetime64[ns]'),
            'IOYAXIS': [5.0, 10.0, 15.0],
            'IOXAXIS': [75.0, 80.0, 85.0],
        },
    )


class Ww3AdapterTests(unittest.TestCase):
    def test_surface_fixture_normalizes_to_browser_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rsmc_combined_ww3_20260916.nc'
            ww3_fixture().to_netcdf(path)
            result = process_ww3(
                {
                    'filename': path.name,
                    'cycle': '2026-09-16T00:00:00Z',
                    'opendapUrl': str(path),
                    'downloadPage': 'fixture',
                },
                Ww3Query(west=75, south=5, east=85, north=15),
            )
        self.assertEqual(result['grid']['depth'], [0.0])
        self.assertEqual(result['grid']['fields']['wave_height'][0], 2.5)
        self.assertEqual(result['grid']['fields']['wave_period'][0], 11.0)
        self.assertEqual(result['grid']['fields']['wind_speed'][0], 5.0)
        self.assertEqual(result['grid']['fields']['wind_u'][0], 3.0)
        self.assertEqual(result['grid']['fields']['wind_v'][0], 4.0)


class Ww3DiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_selects_latest_cycle(self):
        def handler(_request: httpx.Request):
            return httpx.Response(200, text='rsmc_combined_ww3_20260914.nc rsmc_combined_ww3_20260916.nc')

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            reference = await discover_latest_ww3(client)
        self.assertEqual(reference['filename'], 'rsmc_combined_ww3_20260916.nc')
        self.assertTrue(reference['opendapUrl'].endswith(reference['filename']))


if __name__ == '__main__':
    unittest.main()
