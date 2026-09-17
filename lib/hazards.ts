export type SignalStatus = 'provisional' | 'reviewed' | 'official' | 'expired';
export type ScientificClass =
  | 'observed'
  | 'modelled'
  | 'forecast'
  | 'hypothetical';

export type HazardEvidence = {
  datasetId: string;
  variable: string;
  value?: number;
  unit?: string;
  summary: string;
};

export type HazardSignal = {
  id: string;
  type: string;
  geometry: GeoJSON.Geometry;
  verticalExtent: { minDepth: number; maxDepth: number } | null;
  validFrom: string;
  validTo: string;
  severity: 'information' | 'advisory' | 'elevated' | 'severe';
  confidence: number;
  uncertainty: string;
  status: SignalStatus;
  scientificClass: ScientificClass;
  evidence: HazardEvidence[];
  algorithmVersion: string | null;
  sourceDatasetVersions: string[];
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  expiresAt: string;
};

export const PUBLIC_SIGNALS: readonly HazardSignal[] = [];
