import unittest
import numpy as np
import xarray as xr
from .convert import normalize

def fixture():
    data = np.arange(16, dtype=float).reshape(2,2,2,2) + 273.15
    ds = xr.Dataset({'thetao': (('time','depth','lat','lon'),data,{'units':'K'})},coords={'time':np.array(['2026-09-07','2026-09-08'],dtype='datetime64[ns]'),'depth':[0.,100.],'lat':[20.,10.],'lon':[80.,90.]})
    ds.depth.attrs = {'units':'m','positive':'down'}
    return ds

class ConversionTests(unittest.TestCase):
    def test_kelvin_conversion_axis_order_and_missing_values(self):
        ds=fixture()
        ds.thetao.values[0,0,1,0]=np.nan
        out=normalize(ds,'test.nc')
        self.assertEqual(out['grid']['latitude'],[10.,20.])
        self.assertIsNone(out['grid']['fields']['temperature'][0])
        self.assertAlmostEqual(out['grid']['fields']['temperature'][1],3.)
        self.assertEqual(out['grid']['time'][0],'2026-09-07T00:00:00Z')
        self.assertFalse(out['synthetic'])
    def test_pressure_is_not_depth(self):
        ds=fixture();ds.depth.attrs['units']='dbar'
        with self.assertRaisesRegex(ValueError,'pressure'):
            normalize(ds,'test.nc')
    def test_empty_region_rejected(self):
        with self.assertRaisesRegex(ValueError,'selected region'):
            normalize(fixture(),'test.nc',[0,0,1,1])
    def test_unknown_temperature_units_rejected(self):
        ds=fixture();ds.thetao.attrs['units']='furlongs'
        with self.assertRaisesRegex(ValueError,'Temperature units'):
            normalize(ds,'test.nc')
    def test_single_time_is_supported(self):
        out=normalize(fixture().isel(time=[0]),'test.nc')
        self.assertEqual(len(out['grid']['time']),1)

if __name__=='__main__':
    unittest.main()
