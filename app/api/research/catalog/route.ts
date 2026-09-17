import { authorizeResearchRequest } from '@/lib/research-auth';
import { DATA_SOURCES } from '@/lib/data-sources';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await authorizeResearchRequest(request);
  if (denied) return denied;
  return Response.json(
    { generatedAt: new Date().toISOString(), sources: DATA_SOURCES },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
