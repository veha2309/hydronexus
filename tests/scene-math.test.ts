import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  globePosition,
  fittingDistance,
  magnitudeRelief,
  wavePhaseOffset,
} from '../lib/scene-math';

await test('globe coordinates preserve radius and put east longitudes east of Greenwich', () => {
  assert.deepEqual(globePosition(0, 0), [8, 0, -0]);
  const india = globePosition(20, 78);
  assert.ok(india[1] > 0 && india[2] < 0);
  assert.ok(Math.abs(Math.hypot(...india) - 8) < 1e-12);
  assert.ok(Math.abs(globePosition(90, 0)[1] - 8) < 1e-12);
});

await test('aggregate wave statistics drive bounded directional crest motion', () => {
  assert.equal(wavePhaseOffset(null, 10, 90, 1, 1, 1), 0);
  assert.equal(wavePhaseOffset(2, 0, 90, 1, 1, 1), 0);
  const first = wavePhaseOffset(2, 10, 90, 1, 2, 0);
  const later = wavePhaseOffset(2, 10, 90, 1, 2, 2);
  const opposite = wavePhaseOffset(2, 10, 270, 1, 2, 0);
  assert.notEqual(first, later);
  assert.notEqual(first, opposite);
  assert.ok(Math.abs(wavePhaseOffset(20, 3, 45, 4, 5, 6)) <= 0.085);
});

await test('wave height and wind speed produce separate bounded 3D relief scales', () => {
  assert.equal(magnitudeRelief('temperature', 20, 0, 30), 0);
  assert.equal(magnitudeRelief('wave_height', null, 0, 5), 0);
  assert.ok(
    magnitudeRelief('wave_height', 5, 0, 5) >
      magnitudeRelief('wind_speed', 20, 0, 20),
  );
  assert.ok(
    magnitudeRelief('wind_speed', 10, 0, 20) >
      magnitudeRelief('wind_speed', 2, 0, 20),
  );
});

await test('camera fit retains the globe inside the available space beside panels', () => {
  for (const [width, height, inset] of [
    [1440, 700, 578],
    [390, 630, 0],
    [871, 660, 262],
  ]) {
    const distance = fittingDistance(8, width, height, inset, 135);
    const projectedRadius = 8 / Math.sqrt(distance ** 2 - 8 ** 2);
    const tangent = Math.tan((20 * Math.PI) / 180);
    assert.ok(projectedRadius < (tangent * (width - inset)) / height);
    assert.ok(projectedRadius < (tangent * (height - 135)) / height);
  }
});
