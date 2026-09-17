import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path
import httpx
import numpy as np
from fastapi.testclient import TestClient
from .main import WorkspaceSubsetRequest, _slice_layer, app
from .test_convert import fixture
from .storage import ArtifactStore

class IngestionAPITests(unittest.TestCase):
    def test_requires_configured_service_token(self):
        with patch.dict(os.environ, {'HYDRONEXUS_SERVICE_TOKEN': 'expected'}):
            with TestClient(app) as client:
                denied=client.post('/ingest',files={'file':('bad.nc',b'invalid','application/x-netcdf')})
                accepted=client.post('/ingest',headers={'x-hydronexus-service-token':'expected'},files={'file':('bad.txt',b'invalid','text/plain')})
            self.assertEqual(denied.status_code,401)
            self.assertEqual(accepted.status_code,400)

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

    def test_argo_source_outage_uses_only_a_validated_cached_artifact(self):
        cached = {
            'synthetic': False,
            'observations': [{'id': 'cached-profile', 'points': []}],
            'processingVersion': 'argo-qc-1.0.0',
        }
        request = httpx.Request('GET', 'https://erddap.incois.gov.in/')
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {'HYDRONEXUS_DATA_DIR': directory},
        ):
            ArtifactStore().put_json('qc', 'incois-argo', cached)
            failure = httpx.ConnectError('source unavailable', request=request)
            with patch(
                'backend.main.fetch_argo',
                new=AsyncMock(side_effect=failure),
            ), TestClient(app) as client:
                response = client.get('/v1/argo/profiles')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['stale'])
        self.assertEqual(response.json()['sourceState'], 'stale-cache')
        self.assertIn('serving last valid', response.headers['warning'])

    def test_workspace_subset_returns_independent_layers_for_one_bbox(self):
        hycom = {'layerId': 'rsmc-hycom', 'name': 'HYCOM'}
        ww3 = {'layerId': 'rsmc-ww3', 'name': 'WW3'}
        with patch(
            'backend.main._workspace_layer',
            new=AsyncMock(side_effect=[hycom, ww3]),
        ), TestClient(app) as client:
            response = client.post('/v1/workspace/subset', json={
                'sources': ['rsmc-hycom', 'rsmc-ww3'],
                'west': 70, 'south': 5, 'east': 90, 'north': 20,
            })
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual([layer['layerId'] for layer in body['layers']], ['rsmc-hycom', 'rsmc-ww3'])
        self.assertEqual(body['query']['west'], 70.0)
        self.assertEqual(body['query']['max_time_steps'], 12)
        self.assertFalse(body['partial'])

    def test_server_slice_selects_variables_times_and_depths_without_interpolation(self):
        layer = {
            'variables': [
                {'id': 'temperature'}, {'id': 'salinity'}, {'id': 'speed'},
            ],
            'grid': {
                'time': ['2026-09-16T00:00:00Z', '2026-09-17T00:00:00Z'],
                'depth': [0, 100], 'latitude': [5, 6], 'longitude': [80, 81],
                'fields': {
                    'temperature': list(range(16)),
                    'salinity': list(range(100, 116)),
                    'u': list(range(200, 216)), 'v': list(range(300, 316)),
                },
            },
        }
        request = WorkspaceSubsetRequest(
            variables=['temperature'], depth_min=100,
            time_start='2026-09-17T00:00:00Z',
        )
        result = _slice_layer(layer, request)
        self.assertEqual(result['grid']['time'], ['2026-09-17T00:00:00Z'])
        self.assertEqual(result['grid']['depth'], [100])
        self.assertEqual(result['grid']['fields'], {'temperature': [12, 13, 14, 15]})
        self.assertFalse(result['serverSlice']['interpolated'])

if __name__=='__main__':
    unittest.main()
