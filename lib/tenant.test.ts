// Tenant isolation — the load-bearing multi-tenancy guarantee: tenant A can never read, credit,
// refund, or resolve tenant B's money, and the webhook routes each payment to the invoice's OWN
// workspace. Runs against an isolated throwaway database with the demo seed disabled.
process.env.MONGODB_DB = "paidup_test_tenant"; // own DB — node --test runs files concurrently
process.env.PAIDUP_NO_SEED = "1";

import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  applyPayment, listInvoices, listEvents, listQuarantine,
  resolveQuarantineToInvoice, markRefunded, markQuarantineBounced, getTenantInvoice,
  createTenantWithOwner, getUserByEmail, deleteInvoice, getInvoice,
  clearWorkspaceData, deleteAccount, changePassword, updateBusinessName,
  recordWithdrawal, updateWithdrawalStatus, getTenant, getUserById, verifyAudit,
  findTenantPayment,
  DEMO_TENANT_ID,
} from "./store.ts";
import { collections, getClient } from "./db.ts";
import type { Invoice } from "./types.ts";

const TEST_COLLECTIONS = ["invoices", "events", "seenTx", "withdrawals", "tenants", "users", "audit", "flags", "meta"] as const;

async function reset(): Promise<void> {
  const c = await collections();
  await Promise.all(TEST_COLLECTIONS.map((name) => (c as unknown as Record<string, { deleteMany: (q: object) => Promise<unknown> }>)[name].deleteMany({})));
}

function mkInvoice(id: string, tenantId: string, amount = 100000): Invoice {
  return {
    id, tenantId, customer: `Cust ${id}`, description: "x", amount, paid: 0, status: "awaiting",
    createdAt: "2026-01-01T00:00:00Z", acctNumber: "1234567890", acctName: "Test/PaidUp",
    bankName: "Nombank MFB", payments: [],
  };
}

/** Two tenants, one invoice each. */
async function fixture(): Promise<{ a: Invoice; b: Invoice }> {
  const a = mkInvoice("INV-A1", "ten_a");
  const b = mkInvoice("INV-B1", "ten_b");
  const c = await collections();
  await c.invoices.insertMany([{ ...a }, { ...b }]);
  return { a, b };
}

beforeEach(reset);
after(async () => { await (await getClient()).close(); });

test("listInvoices / listEvents / listQuarantine are scoped — A never sees B's ledger", async () => {
  const { a, b } = await fixture();
  await applyPayment({ transactionId: "tx_a", aliasAccountReference: a.id, amount: 100000, sender: "A" });
  await applyPayment({ transactionId: "tx_b", aliasAccountReference: b.id, amount: 40000, sender: "B" });
  await applyPayment({ transactionId: "tx_qb", aliasAccountReference: "INV-NOPE", amount: 999, sender: "?", fallbackTenantId: "ten_b" });

  assert.deepEqual((await listInvoices("ten_a")).map((i) => i.id), ["INV-A1"]);
  assert.deepEqual((await listEvents(20, "ten_a")).map((e) => e.id), ["tx_a"]);
  assert.equal((await listQuarantine("ten_a")).length, 0, "B's unmatched payment must be invisible to A");
  assert.deepEqual((await listQuarantine("ten_b")).map((e) => e.id), ["tx_qb"]);
});

test("webhook routing: a matched payment lands in the invoice's OWN tenant", async () => {
  const { b } = await fixture();
  const r = await applyPayment({ transactionId: "tx_wb", aliasAccountReference: b.id, amount: 100000, sender: "B" });
  assert.equal(r.outcome, "paid");
  assert.equal(r.event.tenantId, "ten_b");
});

test("unmatched money goes to the fallback tenant (webhook default: demo/operator)", async () => {
  await fixture();
  const r = await applyPayment({ transactionId: "tx_um", aliasAccountReference: "INV-GHOST", amount: 5000, sender: "?" });
  assert.equal(r.outcome, "quarantine");
  assert.equal(r.event.tenantId, "ten_demo");
});

test("cross-tenant quarantine assignment is refused (both payment and invoice must be yours)", async () => {
  const { a, b } = await fixture();
  await applyPayment({ transactionId: "tx_q", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "?", fallbackTenantId: "ten_a" });
  assert.equal(await resolveQuarantineToInvoice("tx_q", b.id, "ten_a"), null); // A → B's invoice: refused
  assert.equal(await resolveQuarantineToInvoice("tx_q", b.id, "ten_b"), null); // B claims A's payment: refused
  const ok = await resolveQuarantineToInvoice("tx_q", a.id, "ten_a"); // rightful owner: works
  assert.equal(ok?.invoice.id, a.id);
});

test("cross-tenant refund and bounce are refused", async () => {
  const { a } = await fixture();
  await applyPayment({ transactionId: "tx_over", aliasAccountReference: a.id, amount: 150000, sender: "A" });
  assert.equal((await getInvoice(a.id))!.status, "overpaid");
  assert.equal(await markRefunded(a.id, "ten_b"), null, "B must not be able to refund A's surplus");
  assert.ok(await markRefunded(a.id, "ten_a"), "the owner can");

  await applyPayment({ transactionId: "tx_q2", aliasAccountReference: "INV-NOPE", amount: 777, sender: "?", fallbackTenantId: "ten_a" });
  assert.equal(await markQuarantineBounced("tx_q2", "ten_b"), null, "B must not bounce A's money");
  assert.ok(await markQuarantineBounced("tx_q2", "ten_a"));
});

test("getTenantInvoice: another tenant's invoice reads as not-found", async () => {
  const { a } = await fixture();
  assert.equal(await getTenantInvoice(a.id, "ten_b"), undefined);
  assert.equal((await getTenantInvoice(a.id, "ten_a"))?.id, a.id);
});

test("deleteInvoice: only the owner can delete, and only while the invoice is clean", async () => {
  const { a, b } = await fixture();
  assert.deepEqual(await deleteInvoice(a.id, "ten_b"), { ok: false, reason: "not_found" });
  await applyPayment({ transactionId: "tx_d1", aliasAccountReference: b.id, amount: 10, sender: "B" });
  assert.deepEqual(await deleteInvoice(b.id, "ten_b"), { ok: false, reason: "has_payments" });
  assert.deepEqual(await deleteInvoice(a.id, "ten_a"), { ok: true });
  assert.equal((await listInvoices("ten_a")).length, 0);
  const late = await applyPayment({ transactionId: "tx_d2", aliasAccountReference: a.id, amount: 500, sender: "Late", fallbackTenantId: "ten_a" });
  assert.equal(late.outcome, "quarantine", "money for a deleted invoice must quarantine, never vanish");
});

// ── Account management (settings) ──────────────────────────────────────────────────────────────

/** fixture() plus tenant + owner-user records, so the wipe paths have real accounts to act on. */
async function accountFixture(): Promise<{ a: Invoice; b: Invoice }> {
  const invs = await fixture();
  const c = await collections();
  await c.tenants.insertMany([
    { id: "ten_a", businessName: "Alpha Ltd", createdAt: "2026-01-01T00:00:00Z" },
    { id: "ten_b", businessName: "Beta Ltd", createdAt: "2026-01-01T00:00:00Z" },
  ]);
  await c.users.insertMany([
    { id: "usr_a", tenantId: "ten_a", email: "a@alpha.test", passwordHash: "scrypt:s:h", tokenVersion: 1, createdAt: "2026-01-01T00:00:00Z" },
    { id: "usr_b", tenantId: "ten_b", email: "b@beta.test", passwordHash: "scrypt:s:h", tokenVersion: 1, createdAt: "2026-01-01T00:00:00Z" },
  ]);
  return invs;
}

test("deleteAccount: erases ONLY that tenant — data, user, tenant; audit chain survives intact", async () => {
  const { a, b } = await accountFixture();
  await applyPayment({ transactionId: "tx_da", aliasAccountReference: a.id, amount: 100000, sender: "A" });
  await applyPayment({ transactionId: "tx_db", aliasAccountReference: b.id, amount: 40000, sender: "B" });

  const r = await deleteAccount("ten_a");
  assert.ok(r.ok && r.removed.invoices === 1);
  assert.equal(await getTenant("ten_a"), undefined);
  assert.equal(await getUserById("usr_a"), undefined);
  assert.equal((await listInvoices("ten_a")).length, 0);
  assert.equal((await listEvents(20, "ten_a")).length, 0);
  // B is untouched, and the append-only audit chain still verifies end-to-end.
  assert.equal((await listInvoices("ten_b")).length, 1);
  assert.equal((await getInvoice(b.id))!.paid, 40000);
  assert.deepEqual(await verifyAudit(), { ok: true, brokenAt: null });
  // Money sent to the deleted workspace's VA quarantines instead of vanishing.
  const late = await applyPayment({ transactionId: "tx_dl", aliasAccountReference: a.id, amount: 500, sender: "Late" });
  assert.equal(late.outcome, "quarantine");
});

test("clearWorkspaceData: empties the ledger but keeps the login and workspace", async () => {
  const { a } = await accountFixture();
  await applyPayment({ transactionId: "tx_cw", aliasAccountReference: a.id, amount: 100000, sender: "A" });
  const r = await clearWorkspaceData("ten_a");
  assert.ok(r.ok && r.removed.invoices === 1 && r.removed.events === 1);
  assert.equal((await listInvoices("ten_a")).length, 0);
  assert.equal((await getTenant("ten_a"))?.businessName, "Alpha Ltd");
  assert.equal((await getUserById("usr_a"))?.email, "a@alpha.test");
});

test("the demo workspace can never be cleared or deleted", async () => {
  assert.deepEqual(await clearWorkspaceData(DEMO_TENANT_ID), { ok: false, reason: "demo_workspace" });
  assert.deepEqual(await deleteAccount(DEMO_TENANT_ID), { ok: false, reason: "demo_workspace" });
});

test("wipes are blocked while a payout is in flight; unblocked once it settles", async () => {
  await accountFixture();
  await recordWithdrawal({ id: "wd_t1", tenantId: "ten_a", amount: 100, bankCode: "058", accountNumber: "0123456789", accountName: "OWEN", narration: "payout", status: "pending" });
  assert.deepEqual(await clearWorkspaceData("ten_a"), { ok: false, reason: "payout_in_flight" });
  assert.deepEqual(await deleteAccount("ten_a"), { ok: false, reason: "payout_in_flight" });
  await updateWithdrawalStatus("wd_t1", "settled", { tenantId: "ten_a" });
  const r = await deleteAccount("ten_a");
  assert.ok(r.ok && r.removed.withdrawals === 1);
});

test("updateBusinessName renames; changePassword bumps tokenVersion (revokes outstanding sessions)", async () => {
  await accountFixture();
  assert.equal((await updateBusinessName("ten_a", "Alpha Renamed"))?.businessName, "Alpha Renamed");
  assert.equal((await getTenant("ten_a"))?.businessName, "Alpha Renamed");
  const u = await changePassword("usr_a", "scrypt:new:hash");
  assert.equal(u?.tokenVersion, 2);
  assert.equal((await getUserById("usr_a"))?.passwordHash, "scrypt:new:hash");
});

test("signup: duplicate email (case-insensitive) is rejected; lookup is case-insensitive", async () => {
  const first = await createTenantWithOwner({ businessName: "Acme", email: "Owner@Acme.com", passwordHash: "scrypt:s:h" });
  assert.ok("tenant" in first);
  const dup = await createTenantWithOwner({ businessName: "Acme 2", email: "owner@acme.com", passwordHash: "scrypt:s:h" });
  assert.deepEqual(dup, { error: "email_taken" });
  assert.equal((await getUserByEmail("OWNER@ACME.COM"))?.email, "owner@acme.com");
});

test("sessionId is persisted and findTenantPayment is tenant-scoped", async () => {
  const { a, b } = await fixture();
  await applyPayment({ transactionId: "tx_sess", aliasAccountReference: a.id, amount: 1000, sender: "A", sessionId: "SESS-123" });
  const found = await findTenantPayment("ten_a", "tx_sess");
  assert.equal(found?.sessionId, "SESS-123");
  assert.equal(found?.invoiceId, a.id);
  assert.equal(await findTenantPayment("ten_b", "tx_sess"), null); // B cannot see A's payment
});
