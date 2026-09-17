import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  return Response.json(
    {
      error: 'Server-generated research exports are not enabled yet.',
      status: 'not-enabled',
    },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  );
}
