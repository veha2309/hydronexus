export type DataProductClass = 'raw' | 'quality-controlled' | 'derived';

export type QualityMetadata = {
  qcFlag: string | null;
  sourceFlag: string | null;
  uncertainty: number | null;
  isImputed: boolean;
  imputationMethod: string | null;
  sourceDatasetVersion: string;
  processingVersion: string;
};

export type QualityValue = QualityMetadata & {
  value: number | null;
  productClass: DataProductClass;
};

export function validateQualityValue(sample: QualityValue) {
  if (sample.productClass === 'raw' && sample.isImputed)
    throw new Error('Raw values cannot be marked as imputed.');
  if (sample.isImputed && !sample.imputationMethod)
    throw new Error('Imputed values require a documented method.');
  if (!sample.isImputed && sample.imputationMethod)
    throw new Error('Non-imputed values cannot declare an imputation method.');
  if (sample.value !== null && !Number.isFinite(sample.value))
    throw new Error('Data values must be finite or explicitly null.');
  if (sample.uncertainty !== null && sample.uncertainty < 0)
    throw new Error('Uncertainty cannot be negative.');
  return sample;
}
