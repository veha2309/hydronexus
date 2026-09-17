import Papa from 'papaparse';
import {
  VARIABLES,
  type Dataset,
  type Instrument,
  type SensorKind,
} from './ocean';

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const kinds = ['Argo', 'Glider', 'CTD', 'BGC'];
const validTime = (v: unknown): v is string =>
  typeof v === 'string' &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
function fail(message: string): never {
  throw new Error(message);
}
/** Validate before committing any imported dataset to application state. */
export function validateDataset(input: unknown): Dataset {
  if (!input || typeof input !== 'object')
    fail('Expected a HydroNexus dataset object.');
  const d = input as Dataset;
  if (
    typeof d.name !== 'string' ||
    typeof d.source !== 'string' ||
    typeof d.synthetic !== 'boolean'
  )
    fail('Dataset needs name, source and synthetic metadata.');
  if (
    !Array.isArray(d.variables) ||
    !d.variables.length ||
    d.variables.length > 30
  )
    fail('Expected 1–30 variables.');
  const ids = new Set<string>();
  for (const v of d.variables) {
    if (
      !v ||
      typeof v.id !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(v.id) ||
      ids.has(v.id) ||
      typeof v.label !== 'string' ||
      typeof v.unit !== 'string' ||
      typeof v.standardName !== 'string' ||
      !finite(v.min) ||
      !finite(v.max) ||
      v.min >= v.max
    )
      fail('Invalid variable metadata or duplicate identifier.');
    ids.add(v.id);
  }
  if (!Array.isArray(d.observations) || d.observations.length > 500)
    fail('Expected up to 500 instrument profiles.');
  const observationIds = new Set<string>();
  for (const o of d.observations) {
    if (
      !o ||
      typeof o.id !== 'string' ||
      observationIds.has(o.id) ||
      !kinds.includes(o.kind) ||
      !finite(o.latitude) ||
      Math.abs(o.latitude) > 90 ||
      !finite(o.longitude) ||
      Math.abs(o.longitude) > 180 ||
      !validTime(o.time) ||
      typeof o.source !== 'string'
    )
      fail(
        'Invalid instrument metadata, duplicate ID, coordinate or timestamp. Use ISO timestamps with timezone.',
      );
    observationIds.add(o.id);
    if (!Array.isArray(o.points) || !o.points.length || o.points.length > 5000)
      fail('Each profile needs 1–5,000 points.');
    let previous = -1;
    for (const p of o.points) {
      if (
        !p ||
        !finite(p.depth) ||
        p.depth < 0 ||
        p.depth <= previous ||
        !p.values ||
        typeof p.values !== 'object' ||
        Object.values(p.values).some((v) => !finite(v)) ||
        (p.latitude !== undefined &&
          (!finite(p.latitude) || Math.abs(p.latitude) > 90)) ||
        (p.longitude !== undefined &&
          (!finite(p.longitude) || Math.abs(p.longitude) > 180))
      )
        fail(
          'Profile depths must increase, with finite values and valid coordinates.',
        );
      previous = p.depth;
    }
  }
  if (d.grid) {
    const g = d.grid;
    for (const key of ['latitude', 'longitude', 'depth'] as const) {
      const a = g[key];
      if (
        !Array.isArray(a) ||
        !a.length ||
        a.length > 1000 ||
        a.some((v, i) => !finite(v) || (i > 0 && v <= a[i - 1]))
      )
        fail(`Grid ${key} must be strictly increasing numeric coordinates.`);
    }
    if (g.latitude.length < 2 || g.longitude.length < 2 || g.depth.length < 1)
      fail(
        'Grids need at least two latitude/longitude coordinates and one depth. Surface products use depth 0.',
      );
    if (
      g.latitude[0] < -85 ||
      g.latitude.at(-1)! > 85 ||
      g.longitude[0] < -180 ||
      g.longitude.at(-1)! > 180 ||
      g.depth[0] < 0
    )
      fail('Grid coordinates outside supported geographic or depth range.');
    if (
      !Array.isArray(g.time) ||
      !g.time.length ||
      g.time.length > 200 ||
      g.time.some(
        (t, i) =>
          !validTime(t) ||
          (i > 0 && Date.parse(t) <= Date.parse(g.time[i - 1])),
      )
    )
      fail('Grid times must be increasing ISO timestamps with timezone.');
    const size =
      g.time.length * g.depth.length * g.latitude.length * g.longitude.length;
    if (size * d.variables.length > 3_000_000)
      fail(
        'Dataset exceeds browser budget. Subsample with the Python pipeline.',
      );
    if (!g.fields || typeof g.fields !== 'object')
      fail('Grid fields are required.');
    for (const id of Object.keys(g.fields)) {
      const field = g.fields[id];
      if (
        !Array.isArray(field) ||
        field.length !== size ||
        field.some((v) => v !== null && !finite(v))
      )
        fail(
          `Field ${id} must have ${size} values in time/depth/latitude/longitude order; use null for missing data.`,
        );
    }
    for (const id of ids)
      if (!g.fields[id] && !(id === 'speed' && g.fields.u && g.fields.v))
        fail(`No grid field for variable ${id}.`);
  }
  if (!d.grid && !d.observations.length)
    fail('Dataset has neither a model grid nor observations.');
  return d;
}
export function parseObservations(text: string, source: string): Instrument[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length)
    fail(`Text parsing failed: ${parsed.errors[0].message}`);
  const required = ['id', 'kind', 'latitude', 'longitude', 'depth', 'time'];
  if (required.some((k) => !parsed.meta.fields?.includes(k)))
    fail(
      'Required columns: id, kind, latitude, longitude, depth, time; add temperature, salinity, speed or chlorophyll. CSV and tab-delimited text are supported.',
    );
  if (parsed.data.length > 50000) fail('Limit text imports to 50,000 rows.');
  const profiles = new Map<string, Instrument>();
  const number = (v: string | undefined, label: string) => {
    if (v === undefined || !v.trim() || !Number.isFinite(Number(v)))
      fail(`Missing or invalid ${label}.`);
    return Number(v);
  };
  parsed.data.forEach((r, i) => {
    const line = `row ${i + 2}`;
    if (!r.id?.trim() || !kinds.includes(r.kind))
      fail(
        `Invalid instrument ID or kind at ${line}. Kinds: Argo, Glider, CTD, BGC.`,
      );
    if (!validTime(r.time))
      fail(
        `Use ISO UTC timestamps at ${line}, for example 2026-09-07T00:00:00Z.`,
      );
    const latitude = number(r.latitude, `latitude at ${line}`),
      longitude = number(r.longitude, `longitude at ${line}`),
      depth = number(r.depth, `depth at ${line}`);
    const time = new Date(r.time).toISOString(),
      key = `${r.id.trim()}@${time}`;
    const values = Object.fromEntries(
      VARIABLES.filter(
        (v) => r[v.id] !== undefined && r[v.id].trim() !== '',
      ).map((v) => [v.id, number(r[v.id], v.id)]),
    );
    if (!Object.keys(values).length)
      fail(`No supported variable values at ${line}.`);
    if (!profiles.has(key))
      profiles.set(key, {
        id: key,
        kind: r.kind as SensorKind,
        latitude,
        longitude,
        time,
        source,
        points: [],
      });
    const profile = profiles.get(key)!;
    if (profile.kind !== r.kind)
      fail(`Conflicting instrument kinds at ${line}.`);
    profile.points.push({ depth, latitude, longitude, values });
  });
  const observations = [...profiles.values()].map((o) => ({
    ...o,
    points: o.points.sort((a, b) => a.depth - b.depth),
  }));
  validateDataset({
    name: source,
    source,
    synthetic: false,
    variables: VARIABLES,
    observations,
  });
  return observations;
}
