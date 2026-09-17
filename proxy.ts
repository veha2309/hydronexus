import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const host = request.nextUrl.hostname;
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (
    process.env.NODE_ENV === 'production' &&
    !local &&
    request.headers.get('x-forwarded-proto') !== 'https' &&
    request.nextUrl.protocol !== 'https:'
  ) {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = 'https:';
    return NextResponse.redirect(secureUrl, 308);
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  return response;
}

export const config = {
  matcher: ['/research-lab/:path*', '/api/research/:path*'],
};
