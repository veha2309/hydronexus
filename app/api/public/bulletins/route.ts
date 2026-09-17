export async function GET() {
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      bulletins: [],
      source: 'INCOIS / Indian Tsunami Early Warning Centre',
      sourceUrl: 'https://tsunami.incois.gov.in/',
      status: 'connector-pending',
      note: 'HydroNexus does not issue tsunami warnings. Consult the official source.',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      },
    },
  );
}
