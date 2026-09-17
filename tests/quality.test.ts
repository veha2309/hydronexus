import assert from 'node:assert/strict';
import test from 'node:test';
import { validateQualityValue, type QualityValue } from '../lib/data-quality';

const raw: QualityValue = {
  value: 28.4,
  productClass: 'raw',
  qcFlag: '1',
  sourceFlag: 'provider-accepted',
  uncertainty: 0.1,
  isImputed: false,
  imputationMethod: null,
  sourceDatasetVersion: 'cycle-1',
  processingVersion: 'raw-v1',
};

void test('raw, QC and derived values retain explicit lineage', () => {
  assert.equal(validateQualityValue(raw), raw);
  assert.throws(() =>
    validateQualityValue({
      ...raw,
      productClass: 'derived',
      isImputed: true,
      imputationMethod: null,
    }),
  );
  assert.throws(() =>
    validateQualityValue({ ...raw, productClass: 'raw', isImputed: true }),
  );
});
