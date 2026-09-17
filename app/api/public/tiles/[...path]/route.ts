export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return Response.json(
    {
      error: 'No processed live tile is available for this request.',
      path,
      synthetic: false,
    },
    {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=30' },
    },
  );
}
