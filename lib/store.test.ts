// Replay / dedupe regression tests (POLISH S5). These exercise the second replay-defense layer
// (transactionId dedupe in the store) on top of the webhook's signature + timestamp-freshness checks.
// PAIDUP_DISABLE_PERSIST keeps the test from writing the dev ledger; each test installs a clean
// in-memory fixture via the globalThis singleton.
process.env.PAIDUP_DISABLE_PERSIST = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPayment, reversePayment, listQuarantine } from "./store.ts";
import type { Invoice } from "./types.ts";

type StoreShape = {
  invoices: Map<string, Invoice>;
  events: unknown[];
  seenTx: Set<string>;
  seq: number;
  audit: unknown[];
};
const g = globalThis as unknown as { __paidup?: StoreShape };

function fixture(): Invoice {
  const inv: Invoice = {
    id: "INV-T", customer: "Test Co", description: "x", amount: 100000, paid: 0, status: "awaiting",
    createdAt: "2026-01-01T00:00:00Z", acctNumber: "1234567890", acctName: "Test/PaidUp",
    bankName: "Nombank MFB", payments: [],
  };
  g.__paidup = { invoices: new Map([[inv.id, inv]]), events: [], seenTx: new Set(), seq: 1, audit: [] };
  return inv;
}

test("replay: a duplicate transactionId is deduped — no double credit", () => {
  const inv = fixture();
  const p = { transactionId: "tx_dup_1", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" };
  assert.equal(applyPayment(p).outcome, "paid");
  assert.equal(inv.paid, 100000);
  const replay = applyPayment(p); // exact same webhook delivered again (Nomba retries 5x)
  assert.equal(replay.outcome, "duplicate");
  assert.equal(inv.paid, 100000, "balance must not move on replay");
  assert.equal(inv.payments.length, 1, "no duplicate payment row");
});

test("reversal is idempotent — a replayed payment_reversal is a no-op", () => {
  const inv = fixture();
  applyPayment({ transactionId: "tx_r", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" });
  assert.equal(inv.status, "paid");
  assert.equal(reversePayment("tx_r").outcome, "reversed");
  assert.equal(inv.paid, 0);
  const replay = reversePayment("tx_r"); // reversal webhook re-delivered
  assert.equal(replay.outcome, "duplicate");
  assert.equal(inv.paid, 0, "double-reversal must not push the balance negative");
});

test("unmatched alias is quarantined, never lost or misapplied", () => {
  fixture();
  const res = applyPayment({ transactionId: "tx_q", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "Ghost" });
  assert.equal(res.outcome, "quarantine");
  assert.equal(res.invoiceId, null);
});

test("reversing an unknown transaction is idempotent — retries don't pile up feed rows", () => {
  fixture();
  assert.equal(reversePayment("tx_unknown_x").outcome, "reversed");
  assert.equal(reversePayment("tx_unknown_x").outcome, "duplicate"); // Nomba retry
  const evs = (g.__paidup!.events as Array<{ id: string }>).filter((e) => e.id === "rev_tx_unknown_x");
  assert.equal(evs.length, 1, "only one unmatched-reversal event, not one per retry");
});

test("an unresolved quarantine survives the 200-event feed cap (unmatched money is never evicted)", () => {
  fixture();
  applyPayment({ transactionId: "tx_quar", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "Ghost" });
  // Flood the feed well past EVENTS_CAP (200) with matched part-payments.
  for (let i = 0; i < 260; i++) {
    applyPayment({ transactionId: `tx_flood_${i}`, aliasAccountReference: "INV-T", amount: 10, sender: "Test Co" });
  }
  const quar = listQuarantine();
  assert.equal(quar.length, 1, "the unmatched payment must still be present after 260 newer events");
  assert.equal(quar[0].id, "tx_quar");
});
