// Money-path regression tests (POLISH S5) — now against the MongoDB-backed store. These exercise the
// second replay-defense layer (transactionId dedupe) on top of the webhook's signature + freshness
// checks, plus reversal idempotency, quarantine, and the withdrawal write-ahead reserve. They run
// against an ISOLATED throwaway database (paidup_test) with the demo seed disabled, cleared between
// tests, so each assertion sees only what it set up. Requires a live cluster (npm test loads .env.local).
process.env.MONGODB_DB = "paidup_test_store"; // own DB — node --test runs files concurrently
process.env.PAIDUP_NO_SEED = "1";

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  applyPayment, reversePayment, listQuarantine, createInvoice, getInvoice,
  recordWithdrawal, updateWithdrawalStatus, listWithdrawals, tenantWithdrawable, DEMO_TENANT_ID,
} from "./store.ts";
import { collections, getClient } from "./db.ts";
import type { Invoice } from "./types.ts";

const TEST_COLLECTIONS = ["invoices", "events", "seenTx", "withdrawals", "tenants", "users", "audit", "flags", "meta"] as const;

async function reset(): Promise<void> {
  const c = await collections();
  await Promise.all(TEST_COLLECTIONS.map((name) => (c as unknown as Record<string, { deleteMany: (q: object) => Promise<unknown> }>)[name].deleteMany({})));
}

async function fixture(): Promise<Invoice> {
  const inv: Invoice = {
    id: "INV-T", tenantId: "ten_test", customer: "Test Co", description: "x", amount: 100000, paid: 0, status: "awaiting",
    createdAt: "2026-01-01T00:00:00Z", acctNumber: "1234567890", acctName: "Test/PaidUp",
    bankName: "Nombank MFB", payments: [],
  };
  const c = await collections();
  await c.invoices.insertOne({ ...inv });
  return inv;
}

/** Re-read an invoice's persisted state (Mongo is the source of truth now — no in-memory object). */
async function paidOf(id: string): Promise<number> {
  return (await getInvoice(id))!.paid;
}

beforeEach(reset);
after(async () => { await (await getClient()).close(); });

test("replay: a duplicate transactionId is deduped — no double credit", async () => {
  await fixture();
  const p = { transactionId: "tx_dup_1", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" };
  assert.equal((await applyPayment(p)).outcome, "paid");
  assert.equal(await paidOf("INV-T"), 100000);
  const replay = await applyPayment(p); // exact same webhook delivered again (Nomba retries 5x)
  assert.equal(replay.outcome, "duplicate");
  assert.equal(await paidOf("INV-T"), 100000, "balance must not move on replay");
  const inv = (await getInvoice("INV-T"))!;
  assert.equal(inv.payments.length, 1, "no duplicate payment row");
});

test("reversal is idempotent — a replayed payment_reversal is a no-op", async () => {
  await fixture();
  await applyPayment({ transactionId: "tx_r", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" });
  assert.equal((await getInvoice("INV-T"))!.status, "paid");
  assert.equal((await reversePayment("tx_r")).outcome, "reversed");
  assert.equal(await paidOf("INV-T"), 0);
  const replay = await reversePayment("tx_r"); // reversal webhook re-delivered
  assert.equal(replay.outcome, "duplicate");
  assert.equal(await paidOf("INV-T"), 0, "double-reversal must not push the balance negative");
});

test("unmatched alias is quarantined, never lost or misapplied", async () => {
  await fixture();
  const res = await applyPayment({ transactionId: "tx_q", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "Ghost" });
  assert.equal(res.outcome, "quarantine");
  assert.equal(res.invoiceId, null);
});

test("reversing an unknown transaction is idempotent — retries don't pile up feed rows", async () => {
  await fixture();
  assert.equal((await reversePayment("tx_unknown_x")).outcome, "reversed");
  assert.equal((await reversePayment("tx_unknown_x")).outcome, "duplicate"); // Nomba retry
  const c = await collections();
  const n = await c.events.countDocuments({ id: "rev_tx_unknown_x" });
  assert.equal(n, 1, "only one unmatched-reversal event, not one per retry");
});

test("an unresolved quarantine is never evicted amongst many later events", async () => {
  await fixture();
  await applyPayment({ transactionId: "tx_quar", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "Ghost" });
  for (let i = 0; i < 15; i++) {
    await applyPayment({ transactionId: `tx_flood_${i}`, aliasAccountReference: "INV-T", amount: 10, sender: "Test Co" });
  }
  const quar = await listQuarantine();
  assert.equal(quar.length, 1, "the unmatched payment must still be present after many newer events");
  assert.equal(quar[0].id, "tx_quar");
});

test("createInvoice records vaLive only for real Nomba-minted VAs (mock NUBANs stay unmarked)", async () => {
  await fixture();
  const real = await createInvoice({
    tenantId: "ten_test", customer: "Real Co", description: "x", amount: 1000,
    acctNumber: "8888888888", acctName: "Real/PaidUp", bankName: "Nombank MFB", vaLive: true,
  });
  const mock = await createInvoice({
    tenantId: "ten_test", customer: "Mock Co", description: "x", amount: 1000,
    acctNumber: "3000000001", acctName: "Mock/PaidUp", bankName: "Nombank MFB",
  });
  assert.equal(real.vaLive, true, "real VA must be flagged so deletion can expire it upstream");
  assert.equal(mock.vaLive, undefined, "mock NUBAN must never be flagged (nothing to expire at Nomba)");
});

test("recordWithdrawal persists, audits, and is idempotent on id", async () => {
  const input = {
    id: "wd_test_0001", tenantId: DEMO_TENANT_ID, amount: 150.5,
    bankCode: "058", accountNumber: "0107841806", accountName: "CRESIOLABS LTD",
    narration: "PaidUp payout", live: false,
  };
  const first = await recordWithdrawal(input);
  assert.equal(first.amount, 150.5);
  const replay = await recordWithdrawal({ ...input, amount: 999999 }); // replayed request must NOT double-record
  assert.equal(replay.amount, 150.5);
  const mine = await listWithdrawals(DEMO_TENANT_ID);
  assert.equal(mine.filter((w) => w.id === "wd_test_0001").length, 1);
});

test("listWithdrawals is tenant-scoped", async () => {
  await recordWithdrawal({
    id: "wd_test_0002", tenantId: "ten_other", amount: 10,
    bankCode: "058", accountNumber: "0000000000", accountName: "X", narration: "n", live: false,
  });
  const mine = await listWithdrawals(DEMO_TENANT_ID);
  assert.ok(!mine.some((w) => w.id === "wd_test_0002"));
});

test("tenantWithdrawable = net collections minus prior payouts, surplus reserved", async () => {
  await fixture(); // INV-T: ten_test, amount 100000, paid 0
  await applyPayment({ transactionId: "tx_wd_1", aliasAccountReference: "INV-T", amount: 120000, sender: "Test Co" });
  assert.equal(await tenantWithdrawable("ten_test"), 100000, "overpaid surplus stays reserved for refund");
  await recordWithdrawal({
    id: "wd_test_net", tenantId: "ten_test", amount: 40000,
    bankCode: "058", accountNumber: "0000000001", accountName: "T", narration: "n", live: false,
  });
  assert.equal(await tenantWithdrawable("ten_test"), 60000);
  assert.equal(await tenantWithdrawable("ten_other_2"), 0);
});

test("createInvoice persists dueDate and derives a 'Due in Nd' label", async () => {
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const inv = await createInvoice({
    tenantId: "ten_due", customer: "C", description: "x", amount: 1000,
    acctNumber: "1", acctName: "a", bankName: "b", dueDate: due,
  });
  assert.equal(inv.dueDate, due);
  assert.match(inv.dueLabel ?? "", /Due in \d+d|Due today/);
});

test("recordWithdrawal rejects invalid amounts", async () => {
  await assert.rejects(() => recordWithdrawal({
    id: "wd_test_bad", tenantId: DEMO_TENANT_ID, amount: NaN,
    bankCode: "058", accountNumber: "0107841806", accountName: "X", narration: "n", live: false,
  }));
});

test("write-ahead: a PENDING payout reserves the balance so it can't be double-spent", async () => {
  await fixture(); // INV-T: ten_test, amount 100000
  await applyPayment({ transactionId: "tx_wa_1", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" });
  assert.equal(await tenantWithdrawable("ten_test"), 100000);
  await recordWithdrawal({
    id: "wd_wa_1", tenantId: "ten_test", amount: 60000,
    bankCode: "058", accountNumber: "0000000002", accountName: "T", narration: "n",
  });
  assert.equal(await tenantWithdrawable("ten_test"), 40000, "pending payout must reduce withdrawable immediately");
  const w = (await listWithdrawals("ten_test")).find((x) => x.id === "wd_wa_1");
  assert.equal(w?.status, "pending");
  assert.equal(w?.live, false);
});

test("updateWithdrawalStatus: settled keeps the reserve, failed frees it", async () => {
  await fixture();
  await applyPayment({ transactionId: "tx_wa_2", aliasAccountReference: "INV-T", amount: 100000, sender: "Test Co" });
  await recordWithdrawal({
    id: "wd_settle", tenantId: "ten_test", amount: 30000,
    bankCode: "058", accountNumber: "0000000003", accountName: "T", narration: "n",
  });
  await recordWithdrawal({
    id: "wd_fail", tenantId: "ten_test", amount: 20000,
    bankCode: "058", accountNumber: "0000000004", accountName: "T", narration: "n",
  });
  assert.equal(await tenantWithdrawable("ten_test"), 50000); // 100k - 30k - 20k, both pending

  await updateWithdrawalStatus("wd_settle", "settled", { live: true, tenantId: "ten_test" });
  assert.equal(await tenantWithdrawable("ten_test"), 50000, "settling keeps the reserve — money really left");
  assert.equal((await listWithdrawals("ten_test")).find((x) => x.id === "wd_settle")?.live, true);

  await updateWithdrawalStatus("wd_fail", "failed", { tenantId: "ten_test" });
  assert.equal(await tenantWithdrawable("ten_test"), 70000, "failing a payout frees its reserved amount");

  // Cross-tenant guard: can't move another tenant's record
  assert.equal(await updateWithdrawalStatus("wd_settle", "failed", { tenantId: "ten_other_9" }), null);
});
