import 'server-only';

import { createHash } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const memory = new Map<string, { count: number; resetAt: number }>();
let redisPromise: Promise<RedisClientType> | null = null;

function keyFor(identifier: string) {
  return `hydronexus:research-login:${createHash('sha256').update(identifier).digest('hex')}`;
}

async function redis() {
  const url = process.env.HYDRONEXUS_REDIS_URL;
  if (!url) return null;
  if (!redisPromise) {
    const client = createClient({ url });
    client.on('error', () => undefined);
    redisPromise = client.connect().then(() => client as RedisClientType);
  }
  try {
    return await redisPromise;
  } catch {
    redisPromise = null;
    return null;
  }
}

function memoryEntry(key: string) {
  const now = Date.now();
  const current = memory.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
    memory.set(key, fresh);
    return fresh;
  }
  return current;
}

export async function loginAttemptState(identifier: string) {
  const key = keyFor(identifier);
  const client = await redis();
  if (client) {
    const [countValue, ttlValue] = await Promise.all([
      client.get(key),
      client.ttl(key),
    ]);
    const count = Number(countValue ?? 0);
    return {
      allowed: count < MAX_FAILURES,
      count,
      retryAfter: ttlValue > 0 ? ttlValue : WINDOW_SECONDS,
      shared: true,
    };
  }
  if (process.env.NODE_ENV === 'production')
    return {
      allowed: false,
      count: MAX_FAILURES,
      retryAfter: WINDOW_SECONDS,
      shared: false,
    };
  const entry = memoryEntry(key);
  return {
    allowed: entry.count < MAX_FAILURES,
    count: entry.count,
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)),
    shared: false,
  };
}

export async function recordLoginFailure(identifier: string) {
  const key = keyFor(identifier);
  const client = await redis();
  let count: number;
  if (client) {
    count = await client.incr(key);
    if (count === 1) await client.expire(key, WINDOW_SECONDS);
  } else {
    const entry = memoryEntry(key);
    entry.count += 1;
    count = entry.count;
  }
  await new Promise((resolve) =>
    setTimeout(resolve, Math.min(1000, 75 * 2 ** Math.min(count, 4))),
  );
  return count;
}

export async function clearLoginFailures(identifier: string) {
  const key = keyFor(identifier);
  const client = await redis();
  if (client) await client.del(key);
  memory.delete(key);
}
