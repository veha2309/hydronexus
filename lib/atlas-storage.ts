import { DEFAULT_DISPLAY, SENSOR_KINDS, type DisplaySettings } from './atlas';
import {
  DEMO,
  boundsFor,
  depthsFor,
  timesFor,
  type Dataset,
  type SensorKind,
} from './ocean';
import { validateDataset } from './ingestion';
import type { OceanView } from './scene-math';

export const ATLAS_STORAGE_KEY = 'hydronexus.atlas.v1';
export type SavedAtlas = {
  data: Dataset;
  variable: string;
  depth: number;
  view: OceanView;
  display: DisplaySettings;
  timeIndex: number;
  speed: string;
  sensors: SensorKind[];
  selected: string | null;
  compare: boolean;
  sectionLatitude: number;
  controlsOpen: boolean;
  inspectorOpen: boolean;
  guideStep: number | null;
  guideTime: number;
};
export function encodeAtlas(state: SavedAtlas) {
  const payload = {
    version: 1,
    ...state,
    data: state.data === DEMO ? null : state.data,
  };
  const encoded = JSON.stringify(payload);
  // localStorage is intentionally only a convenience for small imports. Live
  // model subsets can contain millions of values and remain available in the
  // current session; their UI settings are persisted against the bundled data.
  return encoded.length <= 1_500_000
    ? encoded
    : JSON.stringify({ ...payload, data: null, selected: null });
}
export function decodeAtlas(raw: string): SavedAtlas | null {
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return null;
    const data = s.data == null ? DEMO : validateDataset(s.data);
    const variable =
      data.variables.find((v) => v.id === s.variable) ?? data.variables[0];
    const display = {
      ...DEFAULT_DISPLAY,
      min: variable.min,
      max: variable.max,
    };
    for (const key of Object.keys(display) as (keyof DisplaySettings)[]) {
      const value = s.display?.[key];
      if (
        typeof value === typeof display[key] &&
        (typeof value !== 'number' || Number.isFinite(value))
      ) {
        Object.assign(display, { [key]: value });
      }
    }
    if (!['thermal', 'ocean', 'viridis'].includes(display.palette))
      display.palette = 'thermal';
    if (!['volume', 'slice', 'iso'].includes(display.renderMode))
      display.renderMode = 'volume';
    if (display.min >= display.max) {
      display.min = variable.min;
      display.max = variable.max;
    }
    if (display.min <= 0) display.log = false;
    display.opacity = clamp(display.opacity, 0.1, 1);
    display.exaggeration = clamp(display.exaggeration, 1, 30);
    display.lightingStrength = clamp(display.lightingStrength, 0.1, 1);
    const depths = depthsFor(data),
      bounds = boundsFor(data),
      times = timesFor(data);
    return {
      data,
      variable: variable.id,
      display,
      depth: clamp(s.depth, depths[0], depths.at(-1)!),
      view: ['map', 'volume', 'section', 'globe'].includes(s.view)
        ? s.view
        : 'map',
      timeIndex: Math.floor(clamp(s.timeIndex, 0, times.length - 1)),
      speed: ['0.5', '1', '2', '4'].includes(s.speed) ? s.speed : '1',
      sensors: Array.isArray(s.sensors)
        ? SENSOR_KINDS.filter((k) => s.sensors.includes(k))
        : SENSOR_KINDS,
      selected: data.observations.some((o) => o.id === s.selected)
        ? s.selected
        : null,
      compare: s.compare !== false,
      sectionLatitude: clamp(s.sectionLatitude, bounds.south, bounds.north),
      controlsOpen: s.controlsOpen !== false,
      inspectorOpen: s.inspectorOpen === true,
      guideStep:
        data === DEMO &&
        Number.isInteger(s.guideStep) &&
        s.guideStep >= 0 &&
        s.guideStep <= 3
          ? s.guideStep
          : null,
      guideTime: Math.floor(clamp(s.guideTime, 0, times.length - 1)),
    };
  } catch {
    return null;
  }
}
function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
