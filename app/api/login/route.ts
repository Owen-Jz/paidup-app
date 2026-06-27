import { NextRequest, NextResponse } from "next/server";
import { sessionToken, safeEqual, AUTH_COOKIE } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Brute-force budget per client IP (S3): 8 attempts / 15 min. A successful login clears the bucket,
// so a legitimate operator who fat-fingers a few times is never locked out once they get it right.
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Exchange the shared password for a session cookie (GAPS #16).
export async function POST(req: NextRequest) {
  const pw = process.env.APP_PASSWORD || "";
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!pw) return NextResponse.json({ ok: true, open: true }); // no gate configured

  // Rate-limit BEFORE doing any password work so an attacker can't burn CPU or brute-force.
  const key = `login:${clientIp(req)}`;
  const rl = rateLimit(key, { limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many attempts, try again later" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Constant-time compare over equal-length SHA-256 tokens — never leaks the password length or a
  // character-by-character timing oracle the way a raw `password !== pw` would.
  const ok = password != null && safeEqual(await sessionToken(password), await sessionToken(pw));
  if (!ok) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  resetRateLimit(key); // legit login — don't penalize subsequent requests from this IP
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(pw), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
