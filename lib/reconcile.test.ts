import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, isValidAmount, statusFor, reverse } from "./reconcile.ts";

test("exact payment -> paid", () => {
  const c = classify(450000, 0, 450000);
  assert.equal(c.status, "paid");
  assert.equal(c.balance, 0);
  assert.equal(c.overpaidBy, 0);
  assert.equal(c.newPaid, 450000);
});

test("single underpayment -> partial with balance", () => {
  const c = classify(50000, 0, 20000);
  assert.equal(c.status, "partial");
  assert.equal(c.balance, 30000);
});

test("two partials accumulate to paid", () => {
  const first = classify(50000, 0, 20000);
  assert.equal(first.status, "partial");
  const second = classify(50000, first.newPaid, 30000);
  assert.equal(second.status, "paid");
  assert.equal(second.balance, 0);
});

test("overpayment -> overpaid with refundable surplus", () => {
  const c = classify(1250000, 0, 1300000);
  assert.equal(c.status, "overpaid");
  assert.equal(c.overpaidBy, 50000);
  assert.equal(c.balance, 0);
});

test("paying an already-paid invoice -> overpaid", () => {
  const c = classify(100, 100, 50);
  assert.equal(c.status, "overpaid");
  assert.equal(c.overpaidBy, 50);
});

test("kobo drift within tolerance -> paid", () => {
  assert.equal(classify(100, 0, 99.995).status, "paid");
  assert.equal(classify(100, 99.99, 0.011).status, "paid");
});

test("kobo drift beyond tolerance -> not paid", () => {
  assert.equal(classify(100, 0, 99.95).status, "partial");
  assert.equal(classify(100, 0, 100.5).status, "overpaid");
});

test("invalid incoming amounts throw (no NaN ledger corruption)", () => {
  assert.throws(() => classify(100, 0, NaN));
  assert.throws(() => classify(100, 0, 0));
  assert.throws(() => classify(100, 0, -5));
  assert.throws(() => classify(100, 0, Infinity));
});

test("isValidAmount guards", () => {
  assert.equal(isValidAmount(100), true);
  assert.equal(isValidAmount(0), false);
  assert.equal(isValidAmount(-1), false);
  assert.equal(isValidAmount(NaN), false);
  assert.equal(isValidAmount("100"), false);
});

test("statusFor derives status from totals", () => {
  assert.equal(statusFor(1000, 0), "awaiting");
  assert.equal(statusFor(1000, 400), "partial");
  assert.equal(statusFor(1000, 1000), "paid");
  assert.equal(statusFor(1000, 1200), "overpaid");
});

test("reverse claws back a payment and re-derives status", () => {
  // paid invoice -> reverse the full payment -> back to awaiting
  assert.deepEqual(reverse(1000, 1000, 1000), { newPaid: 0, status: "awaiting" });
  // partial of two payments -> reverse one -> still partial
  assert.deepEqual(reverse(1000, 800, 300), { newPaid: 500, status: "partial" });
  // overpaid -> reverse surplus payment -> back to paid
  assert.deepEqual(reverse(1000, 1200, 200), { newPaid: 1000, status: "paid" });
});

test("reverse never drives paid below zero", () => {
  assert.deepEqual(reverse(1000, 300, 500), { newPaid: 0, status: "awaiting" });
});

test("reverse rejects invalid reversed amounts", () => {
  assert.throws(() => reverse(1000, 500, 0));
  assert.throws(() => reverse(1000, 500, NaN));
});
