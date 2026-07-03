import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptNumber, receiptHash } from "./receipt.ts";
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
