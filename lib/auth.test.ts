import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToken, safeEqual } from "./auth.ts";

test("sessionToken is deterministic and 64 hex chars (SHA-256)", async () => {
  const a = await sessionToken("hunter2");
  const b = await sessionToken("hunter2");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("different passwords produce different tokens", async () => {
  assert.notEqual(await sessionToken("alpha"), await sessionToken("beta"));
});

test("safeEqual returns true only for identical strings", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});
