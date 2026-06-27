// Minimal shared-password gate (GAPS #16). Edge- and Node-safe: uses only Web Crypto (global
// `crypto.subtle`) so the same code runs in middleware (edge) and route handlers (node).
// The session cookie is a SHA-256 token DERIVED from the password — the password itself is never
// stored in the cookie, and there's no DB. Opt-in: when APP_PASSWORD is unset the gate is a no-op
// (the public demo stays open); set it for any real/hosted deploy.

export const AUTH_COOKIE = "paidup_session";

/** Deterministic session token derived from the shared password (hex SHA-256). */
export async function sessionToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`paidup-auth:v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare (avoid leaking length-prefix match timing on the token). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
