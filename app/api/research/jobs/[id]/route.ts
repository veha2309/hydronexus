import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorizeResearchRequest(request);
  if (denied) return denied;
  const { id } = await params;
  return Response.json(
    { error: 'Job not found.', id },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
