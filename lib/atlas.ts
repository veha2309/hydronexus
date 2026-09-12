import { DEMO, compareProfile, type Palette, type SensorKind } from './ocean';
import type { OceanView } from './scene-math';

export const SENSOR_KINDS: SensorKind[] = ['Argo', 'Glider', 'CTD', 'BGC'];
export type DisplaySettings = {
  palette: Palette;
  min: number;
  max: number;
  log: boolean;
  opacity: number;
  exaggeration: number;
  renderMode: 'volume' | 'slice' | 'iso';
  iso: number;
  currents: boolean;
  enhancedLighting: boolean;
  lightingStrength: number;
};
export const DEFAULT_DISPLAY: DisplaySettings = {
  palette: 'thermal',
  min: 2,
  max: 32,
  log: false,
  opacity: 0.85,
  exaggeration: 20,
  renderMode: 'volume',
  iso: 20,
  currents: false,
  enhancedLighting: false,
  lightingStrength: 0.65,
};

type InvestigationStep = {
  title: string;
  heading: string;
  description: string;
  view: OceanView;
  depth: number;
  inspect: boolean;
  compare: boolean;
};
export const INVESTIGATION: readonly InvestigationStep[] = [
  {
    title: 'Locate',
    heading: 'Start with the temperature map',
    description:
      'Find India between the Arabian Sea and the Bay of Bengal. The colors show model temperature at 100 m; the markers locate instrument profiles.',
    view: 'map',
    depth: 100,
    inspect: false,
    compare: false,
  },
  {
    title: 'Descend',
    heading: 'Look 500 metres below the surface',
    description:
      'We have moved from 100 m to 500 m at the same model time. Use the depth slider to explore the layers. The vertical scale is exaggerated so you can see the water column.',
    view: 'volume',
    depth: 500,
    inspect: false,
    compare: false,
  },
  {
    title: 'Inspect',
    heading: 'Follow an Argo temperature profile',
    description:
      'An Argo float records temperature at successive depths. Read the observation curve from top to bottom; depth increases downward. The marker and chart refer to the same instrument.',
    view: 'volume',
    depth: 500,
    inspect: true,
    compare: false,
  },
  {
    title: 'Compare',
    heading: 'Compare the profile with the model',
    description:
      'The model is sampled at the observation’s coordinates, depths, and timestamp. Compare the two curves, then export the numerical values.',
    view: 'volume',
    depth: 500,
    inspect: true,
    compare: true,
  },
];

// Each step is a complete preset: Back restores its scene and comparison state.
export function investigationPreset(index: number) {
  const step = INVESTIGATION[index];
  if (!step) throw new RangeError('Unknown investigation step');
  return {
    view: step.view,
    depth: step.depth,
    variable: 'temperature',
    selected: step.inspect
      ? DEMO.observations.find((o) => o.kind === 'Argo')!.id
      : null,
    compare: step.compare,
    inspectorOpen: step.inspect,
  };
}

export function comparisonExplanation(
  comparison: ReturnType<typeof compareProfile>,
  unit: string,
) {
  const { bias, rmse, count } = comparison;
  if (bias === null || rmse === null || !count)
    return 'There are no matched values at this profile’s location, depths, and time.';
  const direction =
    bias > 0 ? 'higher than' : bias < 0 ? 'lower than' : 'equal to';
  return `Across ${count} matched depths, observations are ${Math.abs(bias).toFixed(3)} ${unit} ${direction} the model on average. RMSE is ${rmse.toFixed(3)} ${unit}; it summarizes the size of the differences, regardless of direction.`;
}

export function comparisonCSV(comparison: ReturnType<typeof compareProfile>) {
  return [
    'depth_m,observation,model,observation_minus_model',
    ...comparison.points.map((p) =>
      [
        p.depth,
        p.observed ?? '',
        p.model ?? '',
        p.observed !== null && p.model !== null ? p.observed - p.model : '',
      ].join(','),
    ),
  ].join('\n');
}
