import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAtlas, encodeAtlas } from '../lib/atlas-storage';
import { DEFAULT_DISPLAY } from '../lib/atlas';
import { DEMO } from '../lib/ocean';

void test('atlas settings round trip with bundled data and guided progress', () => {
  const state = decodeAtlas(
    JSON.stringify({
      version: 1,
      data: null,
      variable: 'salinity',
      depth: 500,
      view: 'volume',
      timeIndex: 3,
      display: { ...DEFAULT_DISPLAY, enhancedLighting: true, opacity: 0.4 },
      sensors: ['Argo'],
      guideStep: 2,
      guideTime: 3,
      selected: DEMO.observations[0].id,
    }),
  )!;
  assert.equal(state.data, DEMO);
  const restored = decodeAtlas(encodeAtlas(state))!;
  assert.deepEqual(restored, state);
  assert.equal(restored.display.enhancedLighting, true);
  assert.equal(restored.depth, 500);
  assert.equal(restored.guideStep, 2);
});
void test('corrupt, obsolete, and out-of-range stored settings are handled safely', () => {
  assert.equal(decodeAtlas('{bad'), null);
  assert.equal(decodeAtlas('{"version":9}'), null);
  const restored = decodeAtlas(
    JSON.stringify({
      version: 1,
      depth: 99999,
      timeIndex: -4,
      view: 'invalid',
      selected: 'missing',
      display: { opacity: 8, palette: 'bad', log: true, min: -2, max: 2 },
    }),
  )!;
  assert.equal(restored.depth, 2000);
  assert.equal(restored.timeIndex, 0);
  assert.equal(restored.view, 'map');
  assert.equal(restored.selected, null);
  assert.equal(restored.display.opacity, 1);
  assert.equal(restored.display.log, false);
});
