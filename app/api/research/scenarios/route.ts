import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  return Response.json(
    {
      error: 'Scenario execution is not enabled in the secure vertical slice.',
      status: 'not-enabled',
    },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  );
}
