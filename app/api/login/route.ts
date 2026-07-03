import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_TTL_SEC, sessionSecret, signSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { getUserByEmail } from "@/lib/store";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/ratelimit";
import { parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Brute-force budget per client IP (S3): 8 attempts / 15 min. A successful login clears the bucket,
// so a legitimate operator who fat-fingers a few times is never locked out once they get it right.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// scrypt of "decoy" — verified against when the email is unknown, so "no such user" and "wrong
// password" take the same time (no user-enumeration timing oracle).
const DECOY_HASH = "scrypt:00000000000000000000000000000000:" + "0".repeat(128);

// Exchange email + password for a signed session cookie (multi-tenant auth).
export async function POST(req: NextRequest) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { email?: unknown; password?: unknown };
  const emailR = reqString(body.email, "email", 254);
  if (!emailR.ok) return NextResponse.json({ error: emailR.error }, { status: 400 });
  const passR = reqString(body.password, "password", 200);
  if (!passR.ok) return NextResponse.json({ error: passR.error }, { status: 400 });

  // Rate-limit BEFORE doing any password work so an attacker can't burn CPU or brute-force.
  const key = `login:${clientIp(req)}`;
  const rl = rateLimit(key, { limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many attempts, try again later" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = getUserByEmail(emailR.value);
  // Always run scrypt (against a decoy when the user is unknown) — same generic error either way.
  const ok = verifyPassword(passR.value, user?.passwordHash ?? DECOY_HASH) && Boolean(user);
  if (!ok || !user) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  resetRateLimit(key); // legit login — don't penalize subsequent requests from this IP
  const token = await signSession(
    { uid: user.id, tid: user.tenantId, ver: user.tokenVersion, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC },
    secret,
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
