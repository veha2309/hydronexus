import { authorizeResearchRequest } from '@/lib/research-auth';
import { compareProfile, DEMO } from '@/lib/ocean';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  let id = '';
  let variable = '';
  try {
    const body = (await request.json()) as { id?: unknown; variable?: unknown };
    if (typeof body.id === 'string') id = body.id;
    if (typeof body.variable === 'string') variable = body.variable;
  } catch {
    // Handled by validation below.
  }
  const profile = DEMO.observations.find((item) => item.id === id);
  if (!profile || !DEMO.variables.some((item) => item.id === variable))
    return Response.json(
      { error: 'Choose a valid profile and variable.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  return Response.json(
    {
      synthetic: true,
      comparison: compareProfile(DEMO, profile, variable),
      provenance: 'Bundled deterministic demonstration.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
