import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { cookies } from 'next/headers';
import { verify } from 'argon2';

export const RESEARCH_PAGE_COOKIE = 'hn_research_page';
export const RESEARCH_API_COOKIE = 'hn_research_api';
export const RESEARCH_CSRF_COOKIE = 'hn_research_csrf';
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

type ResearchSession = {
  version: string;
  issuedAt: number;
  expiresAt: number;
  csrf: string;
  nonce: string;
};

function secretKey() {
  const secret = process.env.HYDRONEXUS_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHash('sha256').update(secret, 'utf8').digest();
}

function authVersion() {
  return process.env.HYDRONEXUS_RESEARCH_AUTH_VERSION || '1';
}

export function isResearchAuthBypassed() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.HYDRONEXUS_RESEARCH_AUTH_BYPASS === 'true'
  );
}

function seal(payload: ResearchSession) {
  const key = secretKey();
  if (!key) throw new Error('Research authentication is not configured.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}

function unseal(token: string | undefined): ResearchSession | null {
  const key = secretKey();
  if (!key || !token) return null;
  try {
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString('utf8'),
    ) as ResearchSession;
    if (
      payload.version !== authVersion() ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > Date.now() + 60_000 ||
      payload.expiresAt <= Date.now() ||
      payload.expiresAt - payload.issuedAt > SESSION_LIFETIME_MS ||
      typeof payload.csrf !== 'string' ||
      typeof payload.nonce !== 'string'
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyResearchPassword(password: string) {
  const hash = process.env.HYDRONEXUS_RESEARCH_PASSWORD_HASH;
  if (!hash || !secretKey() || password.length < 1 || password.length > 256)
    return false;
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}

export function createResearchSession() {
  const issuedAt = Date.now();
  const payload: ResearchSession = {
    version: authVersion(),
    issuedAt,
    expiresAt: issuedAt + SESSION_LIFETIME_MS,
    csrf: randomBytes(24).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
  };
  return { token: seal(payload), csrf: payload.csrf };
}

export async function getResearchSession() {
  const store = await cookies();
  return unseal(
    store.get(RESEARCH_PAGE_COOKIE)?.value ??
      store.get(RESEARCH_API_COOKIE)?.value,
  );
}

export async function isResearchAuthenticated() {
  if (isResearchAuthBypassed()) return true;
  return (await getResearchSession()) !== null;
}

export function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function authorizeResearchRequest(
  request: Request,
  mutation = false,
) {
  if (isResearchAuthBypassed()) return null;
  const session = await getResearchSession();
  if (!session)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  if (
    mutation &&
    (!sameOrigin(request) ||
      !constantTimeEqual(
        request.headers.get('x-hydronexus-csrf') ?? '',
        session.csrf,
      ))
  )
    return Response.json(
      { error: 'Request verification failed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  return null;
}

export function researchCookieOptions(path: string, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path,
  };
}
