import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimit } from "./ratelimit.ts";

test("allows up to the limit, then blocks", () => {
  resetRateLimit("k1");
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(rateLimit("k1", { limit: 5, windowMs: 1000 }, t0).allowed, true, `attempt ${i + 1}`);
  }
  const blocked = rateLimit("k1", { limit: 5, windowMs: 1000 }, t0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec > 0);
});

test("window expiry resets the budget", () => {
  resetRateLimit("k2");
  const t0 = 2_000_000;
  for (let i = 0; i < 5; i++) rateLimit("k2", { limit: 5, windowMs: 1000 }, t0);
  assert.equal(rateLimit("k2", { limit: 5, windowMs: 1000 }, t0).allowed, false);
  // jump past the window
  assert.equal(rateLimit("k2", { limit: 5, windowMs: 1000 }, t0 + 1001).allowed, true);
});

test("resetRateLimit clears a key (used on successful login)", () => {
  resetRateLimit("k3");
  const t0 = 3_000_000;
  for (let i = 0; i < 5; i++) rateLimit("k3", { limit: 5, windowMs: 1000 }, t0);
  assert.equal(rateLimit("k3", { limit: 5, windowMs: 1000 }, t0).allowed, false);
  resetRateLimit("k3");
  assert.equal(rateLimit("k3", { limit: 5, windowMs: 1000 }, t0).allowed, true);
});

test("keys are isolated", () => {
  resetRateLimit();
  const t0 = 4_000_000;
  for (let i = 0; i < 5; i++) rateLimit("a", { limit: 5, windowMs: 1000 }, t0);
  assert.equal(rateLimit("a", { limit: 5, windowMs: 1000 }, t0).allowed, false);
  assert.equal(rateLimit("b", { limit: 5, windowMs: 1000 }, t0).allowed, true);
});
