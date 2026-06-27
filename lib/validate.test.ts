import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonBody, reqString, optString, posAmount, oneOf, MAX_BODY_BYTES } from "./validate.ts";

test("parseJsonBody rejects oversized bodies with 413", () => {
  const big = JSON.stringify({ x: "a".repeat(MAX_BODY_BYTES + 100) });
  const r = parseJsonBody(big);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 413);
});

test("parseJsonBody rejects malformed json with 400", () => {
  const r = parseJsonBody("{not json");
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 400);
});

test("parseJsonBody rejects non-objects (array / primitive) with 400", () => {
  assert.equal(parseJsonBody("[1,2,3]").ok, false);
  assert.equal(parseJsonBody('"hello"').ok, false);
  assert.equal(parseJsonBody("42").ok, false);
});

test("parseJsonBody accepts an empty body as {}", () => {
  const r = parseJsonBody("");
  assert.equal(r.ok, true);
  assert.deepEqual((r as { data: unknown }).data, {});
});

test("reqString rejects non-strings and empties, trims and caps length", () => {
  assert.equal(reqString(123, "customer").ok, false);
  assert.equal(reqString("   ", "customer").ok, false);
  assert.equal(reqString("a".repeat(300), "customer", 120).ok, false);
  const r = reqString("  Konga  ", "customer");
  assert.deepEqual(r, { ok: true, value: "Konga" });
});

test("optString allows empty but still type-checks", () => {
  assert.deepEqual(optString(undefined, "description"), { ok: true, value: "" });
  assert.deepEqual(optString("", "description"), { ok: true, value: "" });
  assert.equal(optString(42, "description").ok, false);
});

test("posAmount rejects non-numbers, NaN, zero/negatives and absurd values", () => {
  for (const bad of ["100", null, undefined, NaN, 0, -5, {}, 2e12]) {
    assert.equal(posAmount(bad as unknown).ok, false, `should reject ${String(bad)}`);
  }
  assert.deepEqual(posAmount(100000.005), { ok: true, value: 100000.01 }); // rounded to kobo
});

test("oneOf enforces an allow-list (enum)", () => {
  assert.equal(oneOf("assign", ["assign", "bounce"] as const, "action").ok, true);
  assert.equal(oneOf("delete", ["assign", "bounce"] as const, "action").ok, false);
  assert.equal(oneOf(123, ["assign", "bounce"] as const, "action").ok, false);
});
