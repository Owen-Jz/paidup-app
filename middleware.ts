import { NextRequest, NextResponse } from "next/server";
import { sessionToken, safeEqual, AUTH_COOKIE } from "@/lib/auth";

// Auth gate (GAPS #16). Runs on the app + API surface. When APP_PASSWORD is unset it's a no-op
// (open demo). The Nomba webhook is NEVER gated here — it authenticates with its own HMAC and is
// called by Nomba, not a logged-in human. The login endpoint is exempt so you can obtain a session.
export const config = { matcher: ["/app/:path*", "/api/:path*"] };

export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/webhook") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value || "";
  const expected = await sessionToken(pw);
  if (cookie && safeEqual(cookie, expected)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
