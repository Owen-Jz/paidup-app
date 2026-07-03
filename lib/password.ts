// Password hashing — Node scrypt (built-in, no deps), per-user random salt. Kept separate from
// lib/auth.ts so the edge middleware (which imports auth for token verification) never pulls in
// node:crypto. Stored format: "scrypt:<saltHex>:<hashHex>" — versioned so the algorithm can be
// swapped later without ambiguity about what an existing hash is.

import crypto from "crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = (stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected); // constant-time — no prefix-match oracle
}
