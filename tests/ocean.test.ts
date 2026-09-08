import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO,
  VARIABLES,
  TIMES,
  sample,
  compareProfile,
  colorFor,
  type Dataset,
} from '../lib/ocean';
import { parseObservations, validateDataset } from '../lib/ingestion';

function grid(): Dataset {
  const values: number[] = [];
  for (const t of [0, 1])
    for (const z of [0, 100])
      for (const y of [10, 20])
        for (const x of [80, 90]) values.push(t * 4 + z * 0.1 + y * 2 + x * 3);
  return {
    name: 'Analytical test',
    source: 'Unit test',
    synthetic: false,
    variables: [VARIABLES[0]],
    observations: [],
    grid: {
      time: [TIMES[0], TIMES[1]],
      depth: [0, 100],
      latitude: [10, 20],
      longitude: [80, 90],
      fields: { temperature: values },
    },
  };
}
void test('multilinear interpolation reproduces a linear 4D field', () => {
  assert.equal(
    sample(grid(), 'temperature', 15, 85, 50, '2026-09-07T03:00:00Z'),
    292,
  );
});
void test('exact edge samples do not require a missing zero-weight corner', () => {
  const d = grid();
  d.grid!.fields.temperature[15] = null;
  assert.equal(sample(d, 'temperature', 10, 80, 0, TIMES[0]), 260);
  assert.equal(
    sample(d, 'temperature', 15, 85, 50, '2026-09-07T03:00:00Z'),
    null,
  );
});
void test('no extrapolation in time, depth or space', () => {
  const d = grid();
  assert.equal(sample(d, 'temperature', 5, 85, 50, TIMES[0]), null);
  assert.equal(sample(d, 'temperature', 15, 85, 150, TIMES[0]), null);
  assert.equal(sample(d, 'temperature', 15, 85, 50, TIMES[2]), null);
  assert.equal(sample(DEMO, 'temperature', 15, 0, 100, TIMES[0]), null);
});
void test('comparison samples observation time and computes RMSE and signed bias', () => {
  const d = grid();
  const o = {
    id: 'test',
    kind: 'Argo' as const,
    source: 'test',
    latitude: 10,
    longitude: 80,
    time: TIMES[1],
    points: [
      { depth: 0, values: { temperature: 267 } },
      { depth: 100, values: { temperature: 270 } },
    ],
  };
  const c = compareProfile(d, o, 'temperature');
  assert.equal(c.count, 2);
  assert.equal(c.rmse, Math.sqrt(12.5));
  assert.equal(c.bias, -0.5);
});
void test('derived current speed uses vector magnitude', () => {
  const d = grid();
  d.grid!.fields.u = Array(16).fill(3);
  d.grid!.fields.v = Array(16).fill(4);
  assert.equal(sample(d, 'speed', 15, 85, 50, TIMES[0]), 5);
});
void test('CSV groups distinct timestamps into separate profiles and sorts depths', () => {
  const csv =
    'id,kind,latitude,longitude,depth,time,temperature\nA,Argo,15,85,100,2026-09-07T00:00:00Z,20\nA,Argo,15,85,0,2026-09-07T00:00:00Z,28\nA,Argo,15,85,0,2026-09-08T00:00:00Z,29';
  const obs = parseObservations(csv, 'test.csv');
  assert.equal(obs.length, 2);
  assert.equal(obs[0].points[0].depth, 0);
});
void test('CSV rejects missing coordinates and timezone-free timestamps', () => {
  assert.throws(
    () =>
      parseObservations(
        'id,kind,latitude,longitude,depth,time,temperature\nA,Argo,,85,0,2026-09-07T00:00:00Z,28',
        'test.csv',
      ),
    /latitude/,
  );
  assert.throws(
    () =>
      parseObservations(
        'id,kind,latitude,longitude,depth,time,temperature\nA,Argo,15,85,0,2026-09-07,28',
        'test.csv',
      ),
    /timestamps/,
  );
});
void test('duplicate depths cannot silently corrupt profiles', () => {
  assert.throws(
    () =>
      parseObservations(
        'id,kind,latitude,longitude,depth,time,temperature\nA,Argo,15,85,0,2026-09-07T00:00:00Z,28\nA,Argo,15,85,0,2026-09-07T00:00:00Z,29',
        'test.csv',
      ),
    /depths/,
  );
});
void test('grid contract validates shape, axes and finite samples', () => {
  assert.equal(validateDataset(grid()).name, 'Analytical test');
  const d = grid();
  d.grid!.fields.temperature.pop();
  assert.throws(() => validateDataset(d), /16 values/);
  const e = grid();
  e.grid!.latitude = [20, 10];
  assert.throws(() => validateDataset(e), /increasing/);
});
void test('palette bounds clamp and logarithmic midpoint maps correctly', () => {
  assert.deepEqual(colorFor(-1, 0, 1, 'thermal'), colorFor(0, 0, 1, 'thermal'));
  const a = colorFor(10, 1, 100, 'ocean', true),
    b = colorFor(0.5, 0, 1, 'ocean');
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-12));
});

void test('Python NetCDF output and sample CSV satisfy the browser contract', () => {
  const data = validateDataset(JSON.parse(readFileSync('public/sample-model.json', 'utf8')));
  assert.equal(data.synthetic, true);
  assert.equal(data.variables.length, 3);
  const observations = parseObservations(readFileSync('public/sample-observations.csv', 'utf8'), 'Synthetic sample CSV');
  assert.equal(observations.length, 7);
  const comparison = compareProfile({ ...data, observations }, observations[0], 'temperature');
  assert.equal(comparison.count, 14);
  assert.ok(comparison.rmse !== null && Number.isFinite(comparison.rmse));
});
