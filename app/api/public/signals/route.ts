import { PUBLIC_SIGNALS } from '@/lib/hazards';

export async function GET() {
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      signals: PUBLIC_SIGNALS,
      note: 'No signal is an official warning unless its status is explicitly official.',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      },
    },
  );
}
