import { DATA_SOURCES } from '@/lib/data-sources';

export async function GET() {
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      sources: DATA_SOURCES.filter((source) => source.publicSituation),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    },
  );
}
