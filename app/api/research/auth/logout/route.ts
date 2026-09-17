import { NextResponse } from 'next/server';
import {
  authorizeResearchRequest,
  RESEARCH_API_COOKIE,
  RESEARCH_CSRF_COOKIE,
  RESEARCH_PAGE_COOKIE,
} from '@/lib/research-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await authorizeResearchRequest(request, true);
  if (denied) return denied;
  const response = NextResponse.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set(RESEARCH_PAGE_COOKIE, '', {
    path: '/research-lab',
    maxAge: 0,
  });
  response.cookies.set(RESEARCH_API_COOKIE, '', {
    path: '/api/research',
    maxAge: 0,
  });
  response.cookies.set(RESEARCH_CSRF_COOKIE, '', {
    path: '/research-lab',
    maxAge: 0,
  });
  return response;
}
