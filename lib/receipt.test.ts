import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptNumber, receiptHash, paymentSummary } from "./receipt.ts";
import type { Invoice } from "./types.ts";

function inv(over = false): Invoice {
  return {
    id: "INV-1044", tenantId: "ten_test", customer: "Konga Online", description: "Storefront redesign", amount: 75500,
    paid: over ? 80000 : 75500, status: over ? "overpaid" : "paid", createdAt: "2026-06-26T09:00:00Z",
    acctNumber: "7741120385", acctName: "Konga/PaidUp", bankName: "Nombank MFB",
    payments: [{ transactionId: "tx1", amount: over ? 80000 : 75500, sender: "Konga Online", bankName: "GTBank", time: "2026-06-26T10:00:00Z", outcome: over ? "overpaid" : "paid" }],
  };
}

test("receiptNumber is derived from the invoice id", () => {
  assert.equal(receiptNumber(inv()), "RCPT-INV1044");
});

test("receiptHash is stable for identical data", () => {
  assert.equal(receiptHash(inv()), receiptHash(inv()));
});

test("receiptHash changes when an amount changes (tamper-evident)", () => {
  assert.notEqual(receiptHash(inv(false)), receiptHash(inv(true)));
});

test("receiptHash is a short hex code", () => {
  assert.match(receiptHash(inv()), /^[0-9a-f]{16}$/);
});

test("paymentSummary sums active payments, ignores reversed, reports the last time + count", () => {
  const inv = {
    id: "INV-1", tenantId: "t", customer: "C", description: "x", amount: 1000, paid: 700,
    status: "partial", createdAt: "2026-01-01T00:00:00Z", acctNumber: "1", acctName: "a", bankName: "b",
    payments: [
      { transactionId: "p1", amount: 500, sender: "C", time: "2026-01-01T10:00:00Z", outcome: "partial" },
      { transactionId: "p2", amount: 200, sender: "C", time: "2026-01-02T10:00:00Z", outcome: "partial" },
      { transactionId: "p3", amount: 300, sender: "C", time: "2026-01-03T10:00:00Z", outcome: "reversed" },
    ],
  } as unknown as import("./types.ts").Invoice;
  const s = paymentSummary(inv);
  assert.equal(s.received, 700);        // 500 + 200, reversed excluded
  assert.equal(s.count, 2);
  assert.equal(s.lastTime, "2026-01-02T10:00:00Z");
});

test("paymentSummary on an unpaid invoice returns zeros and null time", () => {
  const inv = { id: "INV-2", amount: 500, paid: 0, payments: [] } as unknown as import("./types.ts").Invoice;
  const s = paymentSummary(inv);
  assert.deepEqual(s, { received: 0, lastTime: null, count: 0 });
});
