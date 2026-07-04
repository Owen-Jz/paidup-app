// Tenant isolation — the load-bearing multi-tenancy guarantee: tenant A can never read, credit,
// refund, or resolve tenant B's money, and the webhook routes each payment to the invoice's OWN
// workspace. PAIDUP_DISABLE_PERSIST keeps these from touching the dev ledger.
process.env.PAIDUP_DISABLE_PERSIST = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPayment, listInvoices, listEvents, listQuarantine,
  resolveQuarantineToInvoice, markRefunded, markQuarantineBounced, getTenantInvoice,
  createTenantWithOwner, getUserByEmail, deleteInvoice,
} from "./store.ts";
import type { Invoice, FeedEvent } from "./types.ts";

type StoreShape = {
  invoices: Map<string, Invoice>;
  events: FeedEvent[];
  seenTx: Set<string>;
  seq: number;
  audit: unknown[];
  tenants: Map<string, unknown>;
  users: Map<string, unknown>;
};
const g = globalThis as unknown as { __paidup?: StoreShape };

function mkInvoice(id: string, tenantId: string, amount = 100000): Invoice {
  return {
    id, tenantId, customer: `Cust ${id}`, description: "x", amount, paid: 0, status: "awaiting",
    createdAt: "2026-01-01T00:00:00Z", acctNumber: "1234567890", acctName: "Test/PaidUp",
    bankName: "Nombank MFB", payments: [],
  };
}

/** Two tenants, one invoice each. */
function fixture(): { a: Invoice; b: Invoice } {
  const a = mkInvoice("INV-A1", "ten_a");
  const b = mkInvoice("INV-B1", "ten_b");
  g.__paidup = {
    invoices: new Map([[a.id, a], [b.id, b]]),
    events: [], seenTx: new Set(), seq: 1, audit: [],
    tenants: new Map(), users: new Map(),
  };
  return { a, b };
}

test("listInvoices / listEvents / listQuarantine are scoped — A never sees B's ledger", () => {
  const { a, b } = fixture();
  applyPayment({ transactionId: "tx_a", aliasAccountReference: a.id, amount: 100000, sender: "A" });
  applyPayment({ transactionId: "tx_b", aliasAccountReference: b.id, amount: 40000, sender: "B" });
  applyPayment({ transactionId: "tx_qb", aliasAccountReference: "INV-NOPE", amount: 999, sender: "?", fallbackTenantId: "ten_b" });

  assert.deepEqual(listInvoices("ten_a").map((i) => i.id), ["INV-A1"]);
  assert.deepEqual(listEvents(20, "ten_a").map((e) => e.id), ["tx_a"]);
  assert.equal(listQuarantine("ten_a").length, 0, "B's unmatched payment must be invisible to A");
  assert.deepEqual(listQuarantine("ten_b").map((e) => e.id), ["tx_qb"]);
});

test("webhook routing: a matched payment lands in the invoice's OWN tenant", () => {
  const { b } = fixture();
  const r = applyPayment({ transactionId: "tx_wb", aliasAccountReference: b.id, amount: 100000, sender: "B" });
  assert.equal(r.outcome, "paid");
  assert.equal(r.event.tenantId, "ten_b");
});

test("unmatched money goes to the fallback tenant (webhook default: demo/operator)", () => {
  fixture();
  const r = applyPayment({ transactionId: "tx_um", aliasAccountReference: "INV-GHOST", amount: 5000, sender: "?" });
  assert.equal(r.outcome, "quarantine");
  assert.equal(r.event.tenantId, "ten_demo");
});

test("cross-tenant quarantine assignment is refused (both payment and invoice must be yours)", () => {
  const { a, b } = fixture();
  applyPayment({ transactionId: "tx_q", aliasAccountReference: "INV-NOPE", amount: 5000, sender: "?", fallbackTenantId: "ten_a" });
  // A tries to push their unmatched payment into B's invoice: refused.
  assert.equal(resolveQuarantineToInvoice("tx_q", b.id, "ten_a"), null);
  // B tries to claim A's unmatched payment: refused.
  assert.equal(resolveQuarantineToInvoice("tx_q", b.id, "ten_b"), null);
  // The rightful owner assigning within their own workspace: works.
  const ok = resolveQuarantineToInvoice("tx_q", a.id, "ten_a");
  assert.equal(ok?.invoice.id, a.id);
});

test("cross-tenant refund and bounce are refused", () => {
  const { a } = fixture();
  applyPayment({ transactionId: "tx_over", aliasAccountReference: a.id, amount: 150000, sender: "A" });
  assert.equal(a.status, "overpaid");
  assert.equal(markRefunded(a.id, "ten_b"), null, "B must not be able to refund A's surplus");
  assert.ok(markRefunded(a.id, "ten_a"), "the owner can");

  applyPayment({ transactionId: "tx_q2", aliasAccountReference: "INV-NOPE", amount: 777, sender: "?", fallbackTenantId: "ten_a" });
  assert.equal(markQuarantineBounced("tx_q2", "ten_b"), null, "B must not bounce A's money");
  assert.ok(markQuarantineBounced("tx_q2", "ten_a"));
});

test("getTenantInvoice: another tenant's invoice reads as not-found", () => {
  const { a } = fixture();
  assert.equal(getTenantInvoice(a.id, "ten_b"), undefined);
  assert.equal(getTenantInvoice(a.id, "ten_a")?.id, a.id);
});

test("deleteInvoice: only the owner can delete, and only while the invoice is clean", () => {
  const { a, b } = fixture();
  // Cross-tenant delete refused (reads as not_found — no existence oracle).
  assert.deepEqual(deleteInvoice(a.id, "ten_b"), { ok: false, reason: "not_found" });
  // Once money has landed, deletion is refused even for the owner — ledger facts are permanent.
  applyPayment({ transactionId: "tx_d1", aliasAccountReference: b.id, amount: 10, sender: "B" });
  assert.deepEqual(deleteInvoice(b.id, "ten_b"), { ok: false, reason: "has_payments" });
  // A clean invoice deletes fine, and a late payment to its old ref quarantines instead of crediting.
  assert.deepEqual(deleteInvoice(a.id, "ten_a"), { ok: true });
  assert.equal(listInvoices("ten_a").length, 0);
  const late = applyPayment({ transactionId: "tx_d2", aliasAccountReference: a.id, amount: 500, sender: "Late", fallbackTenantId: "ten_a" });
  assert.equal(late.outcome, "quarantine", "money for a deleted invoice must quarantine, never vanish");
});

test("signup: duplicate email (case-insensitive) is rejected; lookup is case-insensitive", () => {
  fixture();
  const first = createTenantWithOwner({ businessName: "Acme", email: "Owner@Acme.com", passwordHash: "scrypt:s:h" });
  assert.ok("tenant" in first);
  const dup = createTenantWithOwner({ businessName: "Acme 2", email: "owner@acme.com", passwordHash: "scrypt:s:h" });
  assert.deepEqual(dup, { error: "email_taken" });
  assert.equal(getUserByEmail("OWNER@ACME.COM")?.email, "owner@acme.com");
});
