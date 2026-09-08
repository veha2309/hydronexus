import { DEMO, compareProfile } from '@/lib/ocean';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams,
    id = q.get('id') ?? DEMO.observations[0].id,
    variable = q.get('variable') ?? 'temperature';
  const instrument = DEMO.observations.find((o) => o.id === id);
  if (!instrument || !DEMO.variables.some((v) => v.id === variable))
    return Response.json(
      { error: 'Unknown demo instrument or variable.' },
      { status: 400 },
    );
  return Response.json({
    synthetic: true,
    instrument,
    variable,
    ...compareProfile(DEMO, instrument, variable),
  });
}
