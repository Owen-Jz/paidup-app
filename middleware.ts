import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sessionSecret, verifySession } from "@/lib/auth";

// Auth gate — FAILS CLOSED. Every /app page, the onboarding wizard, and every API route requires a
// valid signed session token, EXCEPT:
//   /api/webhook — called by Nomba, not a human; it authenticates with its own HMAC signature.
//   /api/login, /api/signup — how you obtain a session.
//   /api/logout — must work even with a stale/invalid cookie (it only clears the cookie).
// The public pay page (/pay/<unguessable-token>) is outside the matcher on purpose — customers
// paying an invoice are not logged in.
// The edge check is signature + expiry only (no store at the edge); the node layer
// (lib/session.ts) additionally checks tokenVersion (revocation) and that the user still exists.
export const config = { matcher: ["/app/:path*", "/get-started", "/api/:path*"] };

const PUBLIC_API = ["/api/webhook", "/api/login", "/api/signup", "/api/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = sessionSecret();
  if (!secret) {
    // Production with no SESSION_SECRET: refuse everything rather than run an open ledger.
    return NextResponse.json({ error: "auth not configured (set SESSION_SECRET)" }, { status: 503 });
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value || "";
  if (token && (await verifySession(token, secret))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
