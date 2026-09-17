import { authorizeResearchRequest } from '@/lib/research-auth';
import { DEMO } from '@/lib/ocean';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await authorizeResearchRequest(request);
  if (denied) return denied;
  const url = new URL(request.url);
  if (url.searchParams.get('source') === 'incois-argo') {
    const serviceUrl = process.env.HYDRONEXUS_DATA_API_URL;
    const serviceToken = process.env.HYDRONEXUS_SERVICE_TOKEN;
    if (!serviceUrl || (process.env.NODE_ENV === 'production' && !serviceToken))
      return Response.json(
        { error: 'The private scientific processing service is unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    const upstream = new URL(
      `${serviceUrl.replace(/\/$/, '')}/v1/argo/profiles`,
    );
    for (const name of ['west', 'south', 'east', 'north', 'start', 'end']) {
      const value = url.searchParams.get(name);
      if (value) upstream.searchParams.set(name, value);
    }
    const maxProfiles = url.searchParams.get('maxProfiles');
    if (maxProfiles) upstream.searchParams.set('max_profiles', maxProfiles);
    try {
      const response = await fetch(upstream, {
        headers: serviceToken
          ? { 'x-hydronexus-service-token': serviceToken }
          : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.text();
      return new Response(body, {
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
  return Response.json(
    {
      synthetic: true,
      observations: DEMO.observations,
      provenance:
        'Bundled deterministic demonstration; not an operational feed.',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
