import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globePosition, fittingDistance } from '../lib/scene-math';

await test('globe coordinates preserve radius and put east longitudes east of Greenwich', () => {
  assert.deepEqual(globePosition(0, 0), [8, 0, -0]);
  const india = globePosition(20, 78);
  assert.ok(india[1] > 0 && india[2] < 0);
  assert.ok(Math.abs(Math.hypot(...india) - 8) < 1e-12);
  assert.ok(Math.abs(globePosition(90, 0)[1] - 8) < 1e-12);
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
