import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISPLAY,
  comparisonCSV,
  comparisonExplanation,
  investigationPreset,
} from '../lib/atlas';

void test('enhanced lighting requires explicit opt-in', () => {
  assert.equal(DEFAULT_DISPLAY.enhancedLighting, false);
});
import { DEMO, compareProfile } from '../lib/ocean';

void test('investigation descends before inspecting the same Argo profile with model comparison', () => {
  const locate = investigationPreset(0),
    descend = investigationPreset(1);
  const inspect = investigationPreset(2),
    compare = investigationPreset(3);
  assert.equal(locate.view, 'map');
  assert.equal(locate.depth, 100);
  assert.equal(descend.depth, 500);
  assert.equal(descend.view, 'volume');
  assert.equal(descend.variable, locate.variable);
  assert.equal(
    inspect.selected,
    DEMO.observations.find((o) => o.kind === 'Argo')!.id,
  );
  assert.equal(compare.selected, inspect.selected);
  assert.equal(inspect.compare, false);
  assert.equal(compare.compare, true);
  // Returning to Inspect or Locate clears later-step state deterministically.
  assert.deepEqual(investigationPreset(2), inspect);
  assert.equal(locate.inspectorOpen, false);
  assert.equal(locate.selected, null);
});

void test('export and explanation use the same calculated comparison, including signed residuals', () => {
  const profile = DEMO.observations.find((o) => o.kind === 'Argo')!;
  const comparison = compareProfile(DEMO, profile, 'temperature');
  const rows = comparisonCSV(comparison).split('\n').slice(1);
  assert.equal(rows.length, comparison.points.length);
  rows.forEach((row, index) => {
    const cells = row.split(','),
      point = comparison.points[index];
    assert.equal(Number(cells[0]), point.depth);
    assert.equal(cells[1], String(point.observed ?? ''));
    assert.equal(cells[2], String(point.model ?? ''));
    assert.equal(
      cells[3],
      point.observed !== null && point.model !== null
        ? String(point.observed - point.model)
        : '',
    );
  });
  const explanation = comparisonExplanation(comparison, '°C');
  assert.ok(explanation.includes(`${comparison.count} matched depths`));
  assert.ok(explanation.includes(`${comparison.rmse!.toFixed(3)} °C`));
  assert.ok(
    explanation.includes(comparison.bias! > 0 ? 'higher than' : 'lower than'),
  );
});

void test('missing model overlap leaves exports empty and does not invent a finding', () => {
  const profile = { ...DEMO.observations[0], latitude: 89, longitude: -170 };
  const comparison = compareProfile(DEMO, profile, 'temperature');
  assert.equal(comparison.count, 0);
  assert.match(comparisonExplanation(comparison, '°C'), /no matched values/);
  for (const row of comparisonCSV(comparison).split('\n').slice(1)) {
    assert.equal(row.split(',')[2], '');
    assert.equal(row.split(',')[3], '');
  }
});
