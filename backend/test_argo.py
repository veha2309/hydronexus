import tempfile
import unittest
from pathlib import Path

import httpx

from .argo import ArgoQuery, fetch_argo, normalize_argo, pressure_to_depth
from .storage import ArtifactStore


def payload(rows):
    columns = [
        'PLATFORM_NUMBER', 'CYCLE_NUMBER', 'DIRECTION', 'time', 'latitude',
        'longitude', 'PRES', 'PRES_QC', 'PRES_ADJUSTED',
        'PRES_ADJUSTED_QC', 'TEMP', 'TEMP_QC', 'TEMP_ADJUSTED',
        'TEMP_ADJUSTED_QC', 'PSAL', 'PSAL_QC', 'PSAL_ADJUSTED',
        'PSAL_ADJUSTED_QC',
    ]
    return {'table': {'columnNames': columns, 'rows': rows}}


class ArgoAdapterTests(unittest.TestCase):
    def test_adjusted_values_are_preferred_and_lineage_is_explicit(self):
        result = normalize_argo(payload([[
            2900264.0, 12, 'A', '2025-04-23T12:00:00Z', 14.5, 86.2,
            100.0, '1', 101.0, '1', 20.0, '1', 19.8, '2', 35.0, '1',
            34.9, '1',
        ]]))
        point = result['observations'][0]['points'][0]
        self.assertAlmostEqual(point['values']['temperature'], 19.8)
        self.assertAlmostEqual(point['values']['salinity'], 34.9)
        self.assertEqual(point['measurements']['temperature']['sourceFlag'], 'adjusted')
        self.assertFalse(point['measurements']['temperature']['isImputed'])
        self.assertEqual(point['measurements']['temperature']['processingVersion'], 'argo-qc-1.0.0')
        self.assertGreater(point['depth'], 99)
        self.assertLess(point['depth'], 102)

    def test_bad_adjusted_qc_falls_back_to_accepted_raw_value(self):
        result = normalize_argo(payload([[
            1, 1, 'A', '2025-04-23T12:00:00Z', 10, 80, 5, '1', 5, '1',
            25, '1', 99, '4', 34, '2', 99, '4',
        ]]))
        point = result['observations'][0]['points'][0]
        self.assertEqual(point['values']['temperature'], 25)
        self.assertEqual(point['measurements']['temperature']['sourceFlag'], 'raw')

    def test_rejected_measurements_are_not_silently_filled(self):
        result = normalize_argo(payload([[
            1, 1, 'A', '2025-04-23T12:00:00Z', 10, 80, 5, '1', 5, '1',
            25, '4', 25, '4', 34, '4', 34, '4',
        ]]))
        self.assertEqual(result['observations'], [])
        self.assertEqual(result['qualitySummary']['rejectedRows'], 1)

    def test_pressure_conversion_is_positive_down(self):
        self.assertEqual(pressure_to_depth(0, 15), 0)
        self.assertAlmostEqual(pressure_to_depth(1000, 15), 991, delta=4)

    def test_artifact_store_is_content_addressed_and_immutable(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ArtifactStore(directory)
            first = store.put_json('raw', 'incois-argo', {'b': 2, 'a': 1})
            second = store.put_json('raw', 'incois-argo', {'a': 1, 'b': 2})
            self.assertEqual(first['sha256'], second['sha256'])
            files = list((Path(directory) / 'raw' / 'incois-argo').glob('*.json'))
            self.assertEqual(len(files), 1)
            self.assertEqual(
                store.latest_json('raw', 'incois-argo'), {'a': 1, 'b': 2}
            )
            self.assertIsNone(store.latest_json('qc', 'incois-argo'))


class ArgoFetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_discovers_latest_time_and_sends_bounded_query(self):
        observed_urls = []
        row = [
            2900264.0, 12, 'A', '2025-04-23T12:00:00Z', 14.5, 86.2,
            100.0, '1', 101.0, '1', 20.0, '1', 19.8, '1', 35.0, '1',
            34.9, '1',
        ]

        def handler(request: httpx.Request):
            observed_urls.append(str(request.url))
            if 'orderByMax' in str(request.url):
                return httpx.Response(200, json={
                    'table': {'columnNames': ['time'], 'rows': [['2025-04-23T13:28:00Z']]},
                })
            return httpx.Response(200, json=payload([row]))

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            _, result = await fetch_argo(
                ArgoQuery(west=80, south=5, east=90, north=20, max_profiles=3),
                client,
            )
        self.assertEqual(len(result['observations']), 1)
        self.assertIn('longitude%3E=80', observed_urls[1])
        self.assertIn('latitude%3C=20', observed_urls[1])
        self.assertEqual(result['query']['end'], '2025-04-23T13:28:00Z')


if __name__ == '__main__':
    unittest.main()
