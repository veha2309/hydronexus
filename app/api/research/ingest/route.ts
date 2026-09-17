import { authorizeResearchRequest } from '@/lib/research-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024)
    return Response.json(
      { error: 'Upload exceeds the 25 MB processing limit.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );

  const serviceUrl = process.env.HYDRONEXUS_DATA_API_URL;
  const serviceToken = process.env.HYDRONEXUS_SERVICE_TOKEN;
  if (!serviceUrl || (process.env.NODE_ENV === 'production' && !serviceToken))
    return Response.json(
      { error: 'The private scientific processing service is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );

  let upload: File;
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (!(candidate instanceof File)) throw new Error('Missing file.');
    upload = candidate;
  } catch {
    return Response.json(
      { error: 'A valid multipart file upload is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (upload.size > MAX_UPLOAD_BYTES)
    return Response.json(
      { error: 'Upload exceeds the 25 MB processing limit.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!/\.(nc|nc4)$/i.test(upload.name))
    return Response.json(
      { error: 'Only NetCDF .nc and .nc4 files are accepted.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );

  const upstream = new FormData();
  upstream.append('file', upload, upload.name);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/ingest`, {
      method: 'POST',
      headers: serviceToken
        ? { 'x-hydronexus-service-token': serviceToken }
        : undefined,
      body: upstream,
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
