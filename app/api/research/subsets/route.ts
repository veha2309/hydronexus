import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'A JSON subset request is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const combined = Array.isArray(body.sources);
  if (
    !combined &&
    !['rsmc-hycom', 'rsmc-ww3'].includes(String(body.source))
  )
    return Response.json(
      { error: 'Only the rsmc-hycom and rsmc-ww3 subset adapters are active.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  const serviceUrl = process.env.HYDRONEXUS_DATA_API_URL;
  const serviceToken = process.env.HYDRONEXUS_SERVICE_TOKEN;
  if (!serviceUrl || (process.env.NODE_ENV === 'production' && !serviceToken))
    return Response.json(
      { error: 'The private scientific processing service is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const product = body.source === 'rsmc-ww3' ? 'ww3' : 'hycom';
  const upstream = new URL(
    `${serviceUrl.replace(/\/$/, '')}${combined ? '/v1/workspace/subset' : `/v1/${product}/latest`}`,
  );
  for (const name of ['west', 'south', 'east', 'north']) {
    const value = body[name];
    if (typeof value === 'number' && Number.isFinite(value))
      upstream.searchParams.set(name, String(value));
  }
  try {
    const response = await fetch(upstream, {
      method: combined ? 'POST' : 'GET',
      headers: serviceToken
        ? {
            'x-hydronexus-service-token': serviceToken,
            ...(combined ? { 'Content-Type': 'application/json' } : {}),
          }
        : combined
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: combined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(180_000),
    });
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: 'The scientific processing service did not respond.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
