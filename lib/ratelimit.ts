// In-memory fixed-window rate limiter (POLISH S3 — brute-force defense for /api/login).
// Per-key request budget (key = client IP). Per-instance only: the Map resets on restart and is not
// shared across serverless invocations — adequate for the single-instance hosted MVP; the production
// swap is a shared store (Redis/Upstash). `now` is injectable so the window logic is unit-testable.

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export type RateResult = { allowed: boolean; remaining: number; retryAfterSec: number };

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateResult {
  const b = store.get(key);
  if (!b || now >= b.resetAt) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, retryAfterSec: 0 };
  }
  if (b.count >= opts.limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { allowed: true, remaining: opts.limit - b.count, retryAfterSec: 0 };
}

/** Clear a key's budget (call on a successful login so a legit user is never penalized). */
export function resetRateLimit(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
