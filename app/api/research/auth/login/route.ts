import { NextResponse } from 'next/server';
import {
  createResearchSession,
  RESEARCH_API_COOKIE,
  RESEARCH_CSRF_COOKIE,
  RESEARCH_PAGE_COOKIE,
  researchCookieOptions,
  sameOrigin,
  verifyResearchPassword,
} from '@/lib/research-auth';
import {
  clearLoginFailures,
  loginAttemptState,
  recordLoginFailure,
} from '@/lib/research-rate-limit';

export const dynamic = 'force-dynamic';

function clientIdentifier(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: Request) {
  const noStore = { 'Cache-Control': 'no-store' };
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: 'Access could not be verified.' },
      { status: 403, headers: noStore },
    );

  const identifier = clientIdentifier(request);
  const state = await loginAttemptState(identifier);
  if (!state.allowed)
    return NextResponse.json(
      { error: 'Access is temporarily unavailable. Try again later.' },
      {
        status: state.shared ? 429 : 503,
        headers: { ...noStore, 'Retry-After': String(state.retryAfter) },
      },
    );

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    // Return the same response as an invalid credential.
  }

  if (!(await verifyResearchPassword(password))) {
    await recordLoginFailure(identifier);
    return NextResponse.json(
      { error: 'Access could not be verified.' },
      { status: 401, headers: noStore },
    );
  }

  await clearLoginFailures(identifier);
  const { token, csrf } = createResearchSession();
  const hostname = new URL(request.url).hostname;
  const local =
    hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  const secure =
    !local &&
    (process.env.NODE_ENV === 'production' ||
      request.headers.get('x-forwarded-proto') === 'https');
  const response = NextResponse.json(
    { authenticated: true },
    { headers: noStore },
  );
  response.cookies.set(
    RESEARCH_PAGE_COOKIE,
    token,
    researchCookieOptions('/research-lab', secure),
  );
  response.cookies.set(
    RESEARCH_API_COOKIE,
    token,
    researchCookieOptions('/api/research', secure),
  );
  response.cookies.set(RESEARCH_CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/research-lab',
  });
  return response;
}
