import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, safeEqual, type SessionPayload } from "./auth.ts";

const SECRET = "test-secret";
const future = Math.floor(Date.now() / 1000) + 3600;

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return { uid: "usr_1", tid: "ten_1", ver: 1, exp: future, ...overrides };
}

test("session token round-trips: sign → verify returns the payload", async () => {
  const token = await signSession(payload(), SECRET);
  const out = await verifySession(token, SECRET);
  assert.deepEqual(out, payload());
});

test("a tampered payload is rejected (signature no longer matches)", async () => {
  const token = await signSession(payload(), SECRET);
  const [body, sig] = token.split(".");
  // Flip the tenant id inside the payload but keep the original signature.
  const json = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  json.tid = "ten_VICTIM";
  const forgedBody = Buffer.from(JSON.stringify(json)).toString("base64url");
  assert.equal(await verifySession(`${forgedBody}.${sig}`, SECRET), null);
});

test("a tampered signature is rejected", async () => {
  const token = await signSession(payload(), SECRET);
  const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  assert.equal(await verifySession(flipped, SECRET), null);
});

test("a token signed with a different secret never verifies", async () => {
  const token = await signSession(payload(), "other-secret");
  assert.equal(await verifySession(token, SECRET), null);
});

test("an expired token is rejected", async () => {
  const token = await signSession(payload({ exp: Math.floor(Date.now() / 1000) - 1 }), SECRET);
  assert.equal(await verifySession(token, SECRET), null);
});

test("garbage tokens are rejected without throwing", async () => {
  for (const bad of ["", "abc", "a.b", "!!!.###", "  ", "a.b.c"]) {
    assert.equal(await verifySession(bad, SECRET), null, `should reject: ${JSON.stringify(bad)}`);
  }
});

test("verification with an empty secret always fails (prod fail-closed)", async () => {
  const token = await signSession(payload(), SECRET);
  assert.equal(await verifySession(token, ""), null);
});

test("safeEqual returns true only for identical strings", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});
