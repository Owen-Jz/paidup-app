import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_TTL_SEC, sessionSecret, signSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { createTenantWithOwner } from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Signups are cheaper to abuse than logins (each one writes a tenant) — keep the budget tight.
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Self-serve signup: business name + email + password → isolated tenant + owner user + session.
export async function POST(req: NextRequest) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { businessName?: unknown; email?: unknown; password?: unknown };

  const bizR = reqString(body.businessName, "businessName", 80);
  if (!bizR.ok) return NextResponse.json({ error: bizR.error }, { status: 400 });
  const emailR = reqString(body.email, "email", 254);
  if (!emailR.ok) return NextResponse.json({ error: emailR.error }, { status: 400 });
  const passR = reqString(body.password, "password", 200);
  if (!passR.ok) return NextResponse.json({ error: passR.error }, { status: 400 });
  if (!EMAIL_RE.test(emailR.value)) {
    return NextResponse.json({ error: "enter a valid email address" }, { status: 400 });
  }
  if (passR.value.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const rl = rateLimit(`signup:${clientIp(req)}`, { limit: SIGNUP_LIMIT, windowMs: SIGNUP_WINDOW_MS });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many signups, try again later" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const created = createTenantWithOwner({
    businessName: bizR.value, email: emailR.value, passwordHash: hashPassword(passR.value),
  });
  if ("error" in created) {
    return NextResponse.json({ error: "that email already has a workspace — sign in instead" }, { status: 409 });
  }

  const { user } = created;
  const token = await signSession(
    { uid: user.id, tid: user.tenantId, ver: user.tokenVersion, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC },
    secret,
  );
  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
