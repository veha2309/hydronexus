import { DEMO, BOUNDS, TIMES, sample } from '@/lib/ocean';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    variable = q.get('variable') ?? 'temperature',
    depth = Number(q.get('depth') ?? 0),
    time = q.get('time') ?? TIMES[0];
  if (
    !DEMO.variables.some((v) => v.id === variable) ||
    !Number.isFinite(depth) ||
    depth < 0 ||
    depth > 2000 ||
    !Number.isFinite(Date.parse(time)) ||
    Date.parse(time) < Date.parse(TIMES[0]) ||
    Date.parse(time) > Date.parse(TIMES.at(-1)!)
  )
    return Response.json(
      {
        error:
          'Use a supported variable, depth 0–2000 m and time within the demo range.',
      },
      { status: 400 },
    );
  const latitude = Array.from({ length: 29 }, (_, i) => BOUNDS.south + i),
    longitude = Array.from({ length: 36 }, (_, i) => BOUNDS.west + i);
  return Response.json({
    synthetic: true,
    variable,
    depth,
    time,
    latitude,
    longitude,
    values: latitude.map((lat) =>
      longitude.map((lon) => sample(DEMO, variable, lat, lon, depth, time)),
    ),
    note: 'Procedural field; coastline masking is applied by the renderer.',
  });
}
