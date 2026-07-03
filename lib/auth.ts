// Stateless HMAC-signed session tokens (multi-tenant auth). Edge- AND Node-safe: uses only Web
// Crypto (global `crypto.subtle`), so the SAME verification runs in middleware (edge runtime) and
// in route handlers (node). No DB lookup at the edge — the token itself carries {uid, tid, ver, exp}
// and its HMAC-SHA256 signature proves it was minted by us and hasn't been tampered with.
//
// Revocation: the token embeds the user's tokenVersion (`ver`); the Node layer compares it against
// the stored user record (lib/session.ts), so bumping the version invalidates every existing token.
// Password hashing lives in lib/password.ts (Node scrypt) — kept OUT of this file so importing auth
// from edge middleware never drags in node:crypto.

export const AUTH_COOKIE = "paidup_session";
export const SESSION_TTL_SEC = 60 * 60 * 8; // 8h

export interface SessionPayload {
  uid: string; // user id
  tid: string; // tenant id
  ver: number; // user's tokenVersion at mint time (checked against the store in the node layer)
  exp: number; // unix seconds
}

/**
 * Resolve the signing secret. Fails CLOSED in production: with no SESSION_SECRET set, no token can
 * be minted or verified (login 503s, middleware rejects). In dev it falls back to a fixed local-only
 * secret so `npm run dev` works out of the box.
 */
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || "";
  if (s) return s;
  return process.env.NODE_ENV === "production" ? "" : "paidup-dev-only-session-secret";
}

// base64url without Buffer (works in edge + node + tests)
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Mint a signed session token: base64url(payload JSON) + "." + base64url(HMAC-SHA256). */
export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  if (!secret) throw new Error("signSession: no secret configured");
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(body, secret));
  return `${body}.${sig}`;
}

/**
 * Verify a token's signature + expiry and return its payload, or null. Signature is checked by
 * re-signing and constant-time comparing, so a forged/tampered token can't pass and the compare
 * can't leak a prefix-match timing oracle. Does NOT check tokenVersion (no store at the edge) —
 * the node layer (lib/session.ts) does that.
 */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64urlEncode(await hmac(body, secret));
  if (!safeEqual(sig, expected)) return null;

  const raw = b64urlDecode(body);
  if (!raw) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (
    typeof payload.uid !== "string" || typeof payload.tid !== "string" ||
    typeof payload.ver !== "number" || typeof payload.exp !== "number"
  ) return null;
  if (payload.exp * 1000 <= Date.now()) return null; // expired
  return payload;
}

/** Constant-time string compare (avoid leaking length-prefix match timing on the token). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
