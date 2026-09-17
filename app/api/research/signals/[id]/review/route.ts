import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  const { id } = await params;
  return Response.json(
    {
      error: 'Signal review storage is not configured yet.',
      id,
      status: 'not-enabled',
    },
    { status: 501, headers: { 'Cache-Control': 'no-store' } },
  );
}
