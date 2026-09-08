import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient
from .main import app
from .test_convert import fixture

class IngestionAPITests(unittest.TestCase):
    def test_rejects_wrong_extension(self):
        with TestClient(app) as client:
            response=client.post('/ingest',files={'file':('bad.txt',b'not netcdf','text/plain')})
            self.assertEqual(response.status_code,400)
    def test_netcdf_to_http_json_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.nc'
            ds=fixture();ds.attrs['hydronexus_synthetic']=np.int32(1);ds.to_netcdf(path)
            with TestClient(app) as client:
                response=client.post('/ingest',files={'file':('test.nc',path.read_bytes(),'application/x-netcdf')})
            self.assertEqual(response.status_code,200,response.text)
            body=response.json();self.assertTrue(body['synthetic']);self.assertEqual(body['name'],'test.nc')
            self.assertAlmostEqual(body['grid']['fields']['temperature'][0],2)
            json.dumps(body,allow_nan=False)
    def test_rejects_invalid_netcdf(self):
        with TestClient(app) as client:
            response=client.post('/ingest',files={'file':('bad.nc',b'invalid netcdf','application/x-netcdf')})
            self.assertEqual(response.status_code,422)

if __name__=='__main__':
    unittest.main()
