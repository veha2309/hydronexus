/** Canonical browser data contract. Depth is metres positive down; time is ISO UTC. */
export type Variable = string;
export type SensorKind = 'Argo' | 'Glider' | 'CTD' | 'BGC';
export type VariableSpec = {
  id: string;
  label: string;
  unit: string;
  standardName: string;
  min: number;
  max: number;
};
export type ProfilePoint = {
  depth: number;
  latitude?: number;
  longitude?: number;
  values: Record<string, number>;
};
export type Instrument = {
  id: string;
  kind: SensorKind;
  latitude: number;
  longitude: number;
  time: string;
  source: string;
  points: ProfilePoint[];
};
export type Grid = {
  latitude: number[];
  longitude: number[];
  depth: number[];
  time: string[];
  fields: Record<string, (number | null)[]>;
};
export type Dataset = {
  name: string;
  source: string;
  synthetic: boolean;
  variables: VariableSpec[];
  grid?: Grid;
  observations: Instrument[];
};
export type Palette = 'thermal' | 'ocean' | 'viridis';
export const VARIABLES: VariableSpec[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    unit: 'Â°C',
    standardName: 'sea_water_temperature',
    min: 2,
    max: 32,
  },
  {
    id: 'salinity',
    label: 'Salinity',
    unit: 'PSU',
    standardName: 'sea_water_salinity',
    min: 32,
    max: 37,
  },
  {
    id: 'speed',
    label: 'Current speed',
    unit: 'm/s',
    standardName: 'sea_water_speed',
    min: 0,
    max: 1,
  },
  {
    id: 'chlorophyll',
    label: 'Chlorophyll',
    unit: 'mg/mÂ³',
    standardName: 'mass_concentration_of_chlorophyll_in_sea_water',
    min: 0.01,
    max: 2,
  },
];
export const DEPTHS = [
  0, 10, 25, 50, 75, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000,
];
export const TIMES = Array.from({ length: 13 }, (_, i) =>
  new Date(Date.UTC(2026, 8, 7, i * 6)).toISOString(),
);
export const BOUNDS = { west: 65, east: 100, south: 0, north: 28 };
export function syntheticValue(
  variable: string,
  lat: number,
  lon: number,
  depth: number,
  hour: number,
): number {
  const phase = hour / 24;
  const eddy = Math.sin((lon - 80) / 3 + phase) * Math.cos((lat - 12) / 4);
  const surface =
    28.8 + 1.1 * Math.sin((lon - 76) / 8) - 0.04 * lat + 0.35 * Math.sin(phase);
  const thermocline = 95 + 22 * eddy;
  const u =
    (0.34 * Math.cos((lat - 10) / 3 + phase) + 0.12) * Math.exp(-depth / 1100);
  const v =
    0.38 * Math.sin((lon - 82) / 4 + phase / 2) * Math.exp(-depth / 1100);
  if (variable === 'temperature')
    return (
      3.5 +
      (surface - 3.5) * Math.exp(-depth / (thermocline * 4)) +
      eddy * 0.4 * Math.exp(-depth / 500)
    );
  if (variable === 'salinity')
    return (
      34.8 +
      1.3 * Math.cos((lon - 68) / 12) * Math.exp(-depth / 220) +
      eddy * 0.13
    );
  if (variable === 'u') return u;
  if (variable === 'v') return v;
  if (variable === 'speed') return Math.hypot(u, v);
  if (variable === 'chlorophyll')
    return (
      0.02 + (0.35 + 0.2 * (1 + eddy)) * Math.exp(-(((depth - 65) / 65) ** 2))
    );
  return NaN;
}
const locations: [SensorKind, number, number][] = [
  ['Argo', 14.81, 86.42],
  ['Argo', 12.5, 68.6],
  ['Argo', 8.8, 89.1],
  ['Glider', 16.8, 88.2],
  ['CTD', 7.5, 80.7],
  ['BGC', 18.8, 89.9],
  ['Argo', 15.2, 71.1],
];
export const DEMO: Dataset = {
  name: 'Indian Ocean demonstration',
  source: 'Deterministic synthetic fields Â· not HYCOM or INCOIS observations',
  synthetic: true,
  variables: VARIABLES,
  observations: locations.map(([kind, latitude, longitude], i) => ({
    id: `DEMO-${kind.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
    kind,
    latitude,
    longitude,
    time: TIMES[0],
    source: 'Synthetic instrument profile',
    points: DEPTHS.map((depth, j) => ({
      depth,
      ...(kind === 'Glider'
        ? {
            latitude: latitude + j * 0.08,
            longitude: longitude + Math.sin(j / 3) * 0.65,
          }
        : {}),
      values: Object.fromEntries(
        VARIABLES.map((v) => [
          v.id,
          syntheticValue(v.id, latitude, longitude, depth, 0) +
            (v.id === 'temperature'
              ? 0.65
              : v.id === 'salinity'
                ? 0.08
                : v.id === 'speed'
                  ? 0.025
                  : 0.015) *
              Math.sin(j * 0.65 + i + 0.8),
        ]),
      ),
    })),
  })),
};
export function timesFor(data: Dataset) {
  return (
    data.grid?.time ??
    (data.synthetic
      ? TIMES
      : [...new Set(data.observations.map((o) => o.time))].sort(
          (a, b) => Date.parse(a) - Date.parse(b),
        ))
  );
}
export function depthsFor(data: Dataset) {
  if (data.grid) return data.grid.depth;
  if (data.synthetic) return DEPTHS;
  const ds = [
    ...new Set(data.observations.flatMap((o) => o.points.map((p) => p.depth))),
  ].sort((a, b) => a - b);
  return ds.length > 1 ? ds : [0, Math.max(1, ds[0] ?? 1)];
}
export function boundsFor(data: Dataset) {
  const g = data.grid;
  return g
    ? {
        west: g.longitude[0],
        east: g.longitude.at(-1)!,
        south: g.latitude[0],
        north: g.latitude.at(-1)!,
      }
    : BOUNDS;
}
export function bracket(
  axis: number[],
  value: number,
): [number, number, number] | null {
  if (!Number.isFinite(value) || value < axis[0] || value > axis.at(-1)!)
    return null;
  const hi = axis.findIndex((v) => v >= value);
  if (hi <= 0) return [0, 0, 0];
  return [hi - 1, hi, (value - axis[hi - 1]) / (axis[hi] - axis[hi - 1])];
}
/** Multilinear interpolation; no extrapolation or substitution across missing corners. */
export function sample(
  data: Dataset,
  variable: string,
  lat: number,
  lon: number,
  depth: number,
  time: string,
): number | null {
  if (!data.grid) {
    if (
      !data.synthetic ||
      !Number.isFinite(Date.parse(time)) ||
      Date.parse(time) < Date.parse(TIMES[0]) ||
      Date.parse(time) > Date.parse(TIMES.at(-1)!) ||
      ![lat, lon, depth].every(Number.isFinite) ||
      lat < BOUNDS.south ||
      lat > BOUNDS.north ||
      lon < BOUNDS.west ||
      lon > BOUNDS.east ||
      depth < 0 ||
      depth > 2000 ||
      ![...VARIABLES.map((v) => v.id), 'u', 'v'].includes(variable)
    )
      return null;
    return syntheticValue(
      variable,
      lat,
      lon,
      depth,
      (Date.parse(time) - Date.parse(TIMES[0])) / 3600000,
    );
  }
  const g = data.grid;
  if (variable === 'speed' && !g.fields.speed && g.fields.u && g.fields.v) {
    const u = sample(data, 'u', lat, lon, depth, time),
      v = sample(data, 'v', lat, lon, depth, time);
    return u === null || v === null ? null : Math.hypot(u, v);
  }
  const field = g.fields[variable];
  if (!field) return null;
  const axes = [
    bracket(g.time.map(Date.parse), Date.parse(time)),
    bracket(g.depth, depth),
    bracket(g.latitude, lat),
    bracket(g.longitude, lon),
  ];
  if (axes.some((a) => a === null)) return null;
  let result = 0;
  for (let bits = 0; bits < 16; bits++) {
    let weight = 1;
    const index = axes.map((a, k) => {
      const [lo, hi, t] = a!;
      const upper = !!(bits & (1 << k));
      weight *= upper ? t : 1 - t;
      return upper ? hi : lo;
    });
    if (weight === 0) continue;
    const [t, z, y, x] = index;
    const v =
      field[
        ((t * g.depth.length + z) * g.latitude.length + y) *
          g.longitude.length +
          x
      ];
    if (v === null || !Number.isFinite(v)) return null;
    result += v * weight;
  }
  return result;
}
export function compareProfile(
  data: Dataset,
  instrument: Instrument,
  variable: string,
) {
  const points = instrument.points.map((p) => ({
    depth: p.depth,
    observed: p.values[variable] ?? null,
    model: sample(
      data,
      variable,
      p.latitude ?? instrument.latitude,
      p.longitude ?? instrument.longitude,
      p.depth,
      instrument.time,
    ),
  }));
  const pairs = points.filter(
    (p) =>
      p.model !== null && p.observed !== null && Number.isFinite(p.observed),
  );
  const errors = pairs.map((p) => p.observed! - p.model!);
  const rmse = errors.length
    ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
    : null;
  const bias = errors.length
    ? errors.reduce((s, e) => s + e, 0) / errors.length
    : null;
  let gradient = 0,
    thermocline: number | null = null;
  if (variable === 'temperature')
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a.observed === null || b.observed === null) continue;
      const dz = b.depth - a.depth;
      if (dz <= 0) continue;
      const slope = (b.observed - a.observed) / dz;
      if (slope < gradient) {
        gradient = slope;
        thermocline = (a.depth + b.depth) / 2;
      }
    }
  return { points, rmse, bias, count: pairs.length, thermocline, gradient };
}
const PALETTES: Record<Palette, number[][]> = {
  thermal: [
    [42, 40, 112],
    [36, 97, 173],
    [36, 181, 184],
    [161, 219, 124],
    [248, 218, 91],
    [229, 92, 59],
  ],
  ocean: [
    [10, 34, 78],
    [20, 94, 143],
    [34, 168, 179],
    [131, 221, 199],
    [235, 251, 226],
  ],
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
};
export function colorFor(
  value: number,
  min: number,
  max: number,
  palette: Palette,
  log = false,
): [number, number, number] {
  const t =
    log && min > 0 && value > 0
      ? (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))
      : (value - min) / (max - min);
  const colors = PALETTES[palette],
    p =
      Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) *
      (colors.length - 1),
    i = Math.min(colors.length - 2, Math.floor(p)),
    f = p - i;
  return colors[i].map((v, k) => (v + (colors[i + 1][k] - v) * f) / 255) as [
    number,
    number,
    number,
  ];
}
export function paletteCSS(palette: Palette) {
  return `linear-gradient(90deg,${PALETTES[palette].map((c) => `rgb(${c.join(',')})`).join(',')})`;
}
export function dateLabel(time: string) {
  return (
    new Date(time).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }) + ' UTC'
  );
}
