// Boundary input validation (POLISH S4). Pure functions so every rule is unit-testable and shared by
// the route handlers. Two jobs: (1) cap + safely parse request bodies, (2) narrow/coerce each field
// before it reaches business logic — closing oversized-body DoS, type-confusion, and mass-assignment.

export const MAX_BODY_BYTES = 16 * 1024; // 16 KB — generous for our small JSON payloads

export type ParseResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function byteLength(s: string): number {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(s, "utf8") : new TextEncoder().encode(s).length;
}

// Size-capped JSON parse over the raw body string (routes pass `await req.text()`). Rejects oversized
// bodies (413) and anything that isn't a plain JSON object (400) before any handler logic runs.
export function parseJsonBody<T = Record<string, unknown>>(raw: string, maxBytes = MAX_BODY_BYTES): ParseResult<T> {
  if (byteLength(raw) > maxBytes) return { ok: false, status: 413, error: "request body too large" };
  if (raw.trim() === "") return { ok: true, data: {} as T };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400, error: "expected a JSON object" };
  }
  return { ok: true, data: data as T };
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Required, trimmed, length-capped string. Rejects non-strings (type confusion). */
export function reqString(v: unknown, field: string, maxLen = 200): FieldResult<string> {
  if (typeof v !== "string") return { ok: false, error: `${field} must be a string` };
  const s = v.trim();
  if (!s) return { ok: false, error: `${field} is required` };
  if (s.length > maxLen) return { ok: false, error: `${field} is too long (max ${maxLen})` };
  return { ok: true, value: s };
}

/** Optional string (empty/undefined allowed) with the same type + length guards. */
export function optString(v: unknown, field: string, maxLen = 500): FieldResult<string> {
  if (v == null || v === "") return { ok: true, value: "" };
  return reqString(v, field, maxLen);
}

/** A positive, finite money amount with a sanity ceiling; rounded to kobo. Rejects NaN/string/object. */
export function posAmount(v: unknown): FieldResult<number> {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    return { ok: false, error: "amount must be a positive number" };
  }
  if (v > 1e12) return { ok: false, error: "amount is implausibly large" };
  return { ok: true, value: Math.round(v * 100) / 100 };
}

/** A value constrained to an allow-list (enum). */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): FieldResult<T> {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return { ok: true, value: v as T };
  return { ok: false, error: `${field} must be one of: ${allowed.join(", ")}` };
}
