// Ledger store — MongoDB-backed, multi-tenant. Replaces the old file-backed JSON store: the ledger
// now lives in a real database (collections: invoices, events, seenTx, withdrawals, tenants, users,
// audit, flags, meta), so the app can run on more than one instance and a restart / read-only FS can
// never lose the dedupe set. The MONEY PATH is transactional: every payment/reversal/withdrawal
// mutates the invoice, appends its feed event, claims the transactionId, and chains an audit entry
// ALL-OR-NOTHING inside one Mongo transaction. Dedupe is enforced by a UNIQUE index on seenTx._id
// (a replayed webhook hits a duplicate-key error, never a race). reconcile.ts / verify.ts stay pure.

import crypto from "crypto";
import type { ClientSession } from "mongodb";
import { classify, isValidAmount, reverse } from "./reconcile.ts";
import { dueMeta } from "./due.ts";
import { appendEntry, hashEntry, verifyChain, GENESIS, type AuditEntry } from "./audit.ts";
import { hashPassword } from "./password.ts";
import { collections, ensureIndexes, getClient, type Collections, type FlagDoc } from "./db.ts";
import type { Invoice, FeedEvent, LineItem, Payment, PaymentOutcome, Tenant, User, Withdrawal, WithdrawalStatus } from "./types";

export const DEMO_TENANT_ID = "ten_demo";
export const DEMO_EMAIL = "demo@paidup.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "LedgerDemo2026";
// The merchant using PaidUp — the beneficiary a payer sees; NOT the payer's own name.
export const BUSINESS_NAME = process.env.BUSINESS_NAME || "Cresiolabs";

const NO_ID = { projection: { _id: 0 } as const }; // never leak Mongo's ObjectId into API/JSON responses

// ── Readiness: indexes + first-run demo seed, run once per process ─────────────────────────────
let readyPromise: Promise<Collections> | null = null;
function ready(): Promise<Collections> {
  if (!readyPromise) readyPromise = (async () => {
    await ensureIndexes();
    const c = await collections();
    // PAIDUP_NO_SEED lets the unit tests run against a clean, isolated database (no demo fixtures).
    if (process.env.PAIDUP_NO_SEED !== "1") {
      await ensureDemoTenant(c);
      await seedIfEmpty(c);
    }
    return c;
  })();
  return readyPromise;
}

/** Create the demo tenant + owner user if missing (idempotent). Judges log in with these. */
async function ensureDemoTenant(c: Collections): Promise<void> {
  await c.tenants.updateOne(
    { id: DEMO_TENANT_ID },
    { $setOnInsert: { id: DEMO_TENANT_ID, businessName: BUSINESS_NAME, createdAt: new Date().toISOString() } },
    { upsert: true },
  );
  const hasDemoUser = await c.users.findOne({ tenantId: DEMO_TENANT_ID }, NO_ID);
  if (!hasDemoUser) {
    await c.users.updateOne(
      { email: DEMO_EMAIL },
      { $setOnInsert: {
        id: "usr_demo", tenantId: DEMO_TENANT_ID, email: DEMO_EMAIL,
        passwordHash: hashPassword(DEMO_PASSWORD), tokenVersion: 1, createdAt: new Date().toISOString(),
      } },
      { upsert: true },
    );
  }
}

/** Seed the illustrative demo ledger ONLY when the invoices collection is empty (fresh DB, no
 *  migration). On a migrated DB this is a no-op. Mirrors the old file-store seed. */
async function seedIfEmpty(c: Collections): Promise<void> {
  if (await c.invoices.countDocuments({}, { limit: 1 })) return;
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
  const inv = (id: string, customer: string, description: string, amount: number, acctNumber: string, status: Invoice["status"], paid: number): Invoice => ({
    id, tenantId: DEMO_TENANT_ID, customer, description, amount, paid, status,
    createdAt: iso(180), dueLabel: "Due in 5d",
    acctNumber, acctName: `${BUSINESS_NAME}/PaidUp`, bankName: "Nombank MFB",
    payments: [], payToken: `tok_${id.replace(/-/g, "").toLowerCase()}`,
  });
  const invoices: Invoice[] = [
    inv("INV-1042", "Dangote Cement Plc", "Bulk cement — 200 bags", 450000, "3049420327", "paid", 450000),
    inv("INV-1043", "Jumia Nigeria", "Q2 logistics retainer", 120000, "9882319033", "partial", 70000),
    inv("INV-1044", "Konga Online", "Storefront redesign", 75500, "7741120385", "awaiting", 0),
    inv("INV-1045", "Food Concepts", "POS install", 38000, "8830014472", "awaiting", 0),
    inv("INV-1046", "MTN Nigeria", "API integration — phase 1", 1250000, "5521190044", "overpaid", 1300000),
    inv("INV-1047", "Andela", "Contractor invoice — May", 300000, "6610329981", "paid", 300000),
  ];
  invoices.find((i) => i.id === "INV-1043")!.payments.push({ transactionId: "tx_seed3", amount: 70000, sender: "Jumia Nigeria", bankName: "Opay", senderAccountNumber: "8065219824", senderBankCode: "305", narration: "Part payment", time: iso(40), outcome: "partial" });
  invoices.find((i) => i.id === "INV-1042")!.payments.push({ transactionId: "tx_seed1", amount: 450000, sender: "Dangote Cement Plc", bankName: "GTBank", senderAccountNumber: "0107841806", senderBankCode: "058", narration: "Transfer from Dangote", time: iso(8), outcome: "paid" });
  invoices.find((i) => i.id === "INV-1046")!.payments.push({ transactionId: "tx_seed2", amount: 1300000, sender: "MTN Nigeria", bankName: "Zenith Bank", senderAccountNumber: "1014567890", senderBankCode: "057", narration: "Transfer from MTN", time: iso(22), outcome: "overpaid" });
  invoices.find((i) => i.id === "INV-1047")!.payments.push({ transactionId: "tx_seed5", amount: 300000, sender: "Andela", bankName: "Access Bank", senderAccountNumber: "0691234567", senderBankCode: "044", narration: "Contractor invoice — May", time: iso(120), outcome: "paid" });

  const events: FeedEvent[] = [
    { id: "tx_seed1", tenantId: DEMO_TENANT_ID, invoiceId: "INV-1042", customer: "Dangote Cement Plc", amount: 450000, bankName: "GTBank", narration: "Transfer from Dangote", outcome: "paid", time: iso(8) },
    { id: "tx_seed2", tenantId: DEMO_TENANT_ID, invoiceId: "INV-1046", customer: "MTN Nigeria", amount: 1300000, bankName: "Zenith Bank", narration: "Transfer from MTN", outcome: "overpaid", time: iso(22) },
    { id: "tx_seed3", tenantId: DEMO_TENANT_ID, invoiceId: "INV-1043", customer: "Jumia Nigeria", amount: 70000, bankName: "Opay", narration: "Part payment", outcome: "partial", time: iso(40) },
    { id: "tx_seed4", tenantId: DEMO_TENANT_ID, invoiceId: null, customer: "UNKNOWN SENDER", amount: 55000, bankName: "Kuda", narration: '"Pymt for inv 1050"', outcome: "quarantine", time: iso(55) },
  ];
  // Build the seed audit chain in chronological order (oldest event first).
  const audit: AuditEntry[] = [];
  for (const e of [...events].reverse()) audit.push(appendEntry(audit, `payment.${e.outcome}`, `${e.id} ${e.invoiceId ?? "unmatched"} ${e.amount}`, e.time));

  await c.invoices.insertMany(invoices.map((i) => ({ ...i })));
  await c.events.insertMany(events.map((e) => ({ ...e })));
  await c.audit.insertMany(audit.map((a) => ({ ...a })));
  await c.seenTx.insertMany(["tx_seed1", "tx_seed2", "tx_seed3", "tx_seed4", "tx_seed5"].map((id) => ({ _id: id, at: iso(0) })));
  await c.meta.updateOne({ _id: "seq" }, { $setOnInsert: { value: 1 } }, { upsert: true });
}

// ── Transaction + audit helpers ────────────────────────────────────────────────────────────────

/** Run a money-path mutation atomically, retrying on transient or duplicate-key (audit-seq / seenTx
 *  races resolve on retry — the re-read sees the committed state). */
async function withTxn<T>(fn: (session: ClientSession, c: Collections) => Promise<T>, retries = 5): Promise<T> {
  const c = await ready();
  const client = await getClient();
  for (let attempt = 0; ; attempt++) {
    const session = client.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => { result = await fn(session, c); });
      return result;
    } catch (e: unknown) {
      const err = e as { code?: number; hasErrorLabel?: (l: string) => boolean };
      const retryable = err?.code === 11000 || err?.hasErrorLabel?.("TransientTransactionError");
      if (retryable && attempt < retries) continue;
      throw e;
    } finally {
      await session.endSession();
    }
  }
}

/** Append a tamper-evident audit entry INSIDE a transaction (reads the current tail for the chain).
 *  A concurrent append collides on the unique seq index → withTxn retries → re-reads the new tail. */
async function appendAudit(c: Collections, session: ClientSession, type: string, detail: string, time: string, tenantId?: string): Promise<void> {
  const prev = await c.audit.find({}, { session, sort: { seq: -1 }, limit: 1 }).next();
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? prev.hash : GENESIS;
  const base = tenantId != null ? { seq, time, type, detail, tenantId, prevHash } : { seq, time, type, detail, prevHash };
  await c.audit.insertOne({ ...base, hash: hashEntry(base) }, { session });
}

/** Next monotonic invoice sequence value (atomic $inc). */
async function nextSeq(c: Collections, session?: ClientSession): Promise<number> {
  const doc = await c.meta.findOneAndUpdate({ _id: "seq" }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after", session });
  return doc!.value;
}

// ── Reads (tenant-scoped) ──────────────────────────────────────────────────────────────────────

export async function listInvoices(tenantId: string): Promise<Invoice[]> {
  const c = await ready();
  return c.invoices.find({ tenantId }, NO_ID).sort({ id: 1 }).toArray();
}
export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const c = await ready();
  return (await c.invoices.findOne({ id }, NO_ID)) ?? undefined;
}
export async function getTenantInvoice(id: string, tenantId: string): Promise<Invoice | undefined> {
  const c = await ready();
  return (await c.invoices.findOne({ id, tenantId }, NO_ID)) ?? undefined;
}
export async function listEvents(limit = 20, tenantId?: string): Promise<FeedEvent[]> {
  const c = await ready();
  const q = tenantId ? { tenantId } : {};
  return c.events.find(q, NO_ID).sort({ time: -1, _id: -1 }).limit(limit).toArray();
}
export async function listQuarantine(tenantId?: string): Promise<FeedEvent[]> {
  const c = await ready();
  const q = tenantId ? { outcome: "quarantine" as const, tenantId } : { outcome: "quarantine" as const };
  return c.events.find(q, NO_ID).sort({ time: -1, _id: -1 }).toArray();
}

// ── Tenants & users ──────────────────────────────────────────────────────────────────────────

export async function getTenant(id: string): Promise<Tenant | undefined> {
  const c = await ready();
  return (await c.tenants.findOne({ id }, NO_ID)) ?? undefined;
}
export async function getUserById(id: string): Promise<User | undefined> {
  const c = await ready();
  return (await c.users.findOne({ id }, NO_ID)) ?? undefined;
}
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const c = await ready();
  return (await c.users.findOne({ email: email.trim().toLowerCase() }, NO_ID)) ?? undefined;
}

/** Self-serve signup: mint an isolated tenant + owner user. Unique email index rejects duplicates. */
export async function createTenantWithOwner(input: { businessName: string; email: string; passwordHash: string }):
  Promise<{ tenant: Tenant; user: User } | { error: "email_taken" }> {
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const tenant: Tenant = { id: `ten_${crypto.randomBytes(8).toString("hex")}`, businessName: input.businessName.trim(), createdAt: now };
  const user: User = { id: `usr_${crypto.randomBytes(8).toString("hex")}`, tenantId: tenant.id, email, passwordHash: input.passwordHash, tokenVersion: 1, createdAt: now };
  try {
    return await withTxn(async (session, c) => {
      if (await c.users.findOne({ email }, { session, projection: { _id: 0 } })) return { error: "email_taken" as const };
      await c.tenants.insertOne({ ...tenant }, { session });
      await c.users.insertOne({ ...user }, { session });
      await appendAudit(c, session, "tenant.created", `${tenant.id} ${tenant.businessName}`, now, tenant.id);
      return { tenant, user };
    });
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return { error: "email_taken" }; // unique email race
    throw e;
  }
}

export interface CreateInvoiceInput {
  tenantId: string;
  customer: string; description: string; amount: number;
  lineItems?: LineItem[];
  acctNumber: string; acctName: string; bankName: string; ref?: string;
  vaLive?: boolean;
  dueDate?: string;
}
/** Monotonic, collision-free invoice ref. */
export async function nextInvoiceRef(): Promise<string> {
  const c = await ready();
  return `INV-${1100 + (await nextSeq(c))}`;
}
export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  return withTxn(async (session, c) => {
    // Never overwrite an existing invoice (that would reuse a live reconciliation key) — mint fresh.
    let id = input.ref;
    if (!id || await c.invoices.findOne({ id }, { session, projection: { _id: 0 } })) id = `INV-${1100 + (await nextSeq(c, session))}`;
    const dueDate = input.dueDate;
    const label = dueDate ? (dueMeta(dueDate).label || "Due in 7d") : "Due in 7d";
    const invoice: Invoice = {
      id, tenantId: input.tenantId, customer: input.customer, description: input.description, amount: input.amount,
      paid: 0, status: "awaiting", createdAt: new Date().toISOString(), dueLabel: label,
      acctNumber: input.acctNumber, acctName: input.acctName, bankName: input.bankName, payments: [],
      ...(dueDate ? { dueDate } : {}),
      ...(input.lineItems && input.lineItems.length ? { lineItems: input.lineItems } : {}),
      ...(input.vaLive ? { vaLive: true } : {}),
      payToken: `pay_${crypto.randomBytes(9).toString("hex")}`,
    };
    await c.invoices.insertOne({ ...invoice }, { session });
    await appendAudit(c, session, "invoice.created", `${id} ${input.customer} ${input.amount}`, invoice.createdAt, input.tenantId);
    return invoice;
  });
}

/** Delete an invoice — ONLY while clean (no money ever received). Tenant-enforced. */
export async function deleteInvoice(id: string, tenantId: string):
  Promise<{ ok: true } | { ok: false; reason: "not_found" | "has_payments" }> {
  return withTxn(async (session, c) => {
    const inv = await c.invoices.findOne({ id, tenantId }, { session, projection: { _id: 0 } });
    if (!inv) return { ok: false as const, reason: "not_found" as const };
    if (inv.payments.length > 0 || inv.paid > 0) return { ok: false as const, reason: "has_payments" as const };
    await c.invoices.deleteOne({ id, tenantId }, { session });
    await appendAudit(c, session, "invoice.deleted", `${id} ${inv.customer} ${inv.amount}`, new Date().toISOString(), tenantId);
    return { ok: true as const };
  });
}

// ── Audit ──────────────────────────────────────────────────────────────────────────────────────

export async function getAudit(): Promise<AuditEntry[]> {
  const c = await ready();
  return c.audit.find({}, NO_ID).sort({ seq: 1 }).toArray();
}
export async function verifyAudit(): Promise<{ ok: boolean; brokenAt: number | null }> {
  return verifyChain(await getAudit());
}

/** Look up an invoice by its public, unguessable pay token. */
export async function getInvoiceByToken(token: string): Promise<Invoice | undefined> {
  if (!token) return undefined;
  const c = await ready();
  return (await c.invoices.findOne({ payToken: token }, NO_ID)) ?? undefined;
}

/** Find a single payment (by transactionId) within a tenant's invoices — read-only, for requery. */
export async function findTenantPayment(tenantId: string, transactionId: string):
  Promise<{ invoiceId: string; sessionId?: string; amount: number; time: string; outcome: string } | null> {
  const c = await ready();
  const inv = await c.invoices.findOne({ tenantId, "payments.transactionId": transactionId }, NO_ID);
  if (!inv) return null;
  const p = inv.payments.find((x) => x.transactionId === transactionId);
  if (!p) return null;
  return { invoiceId: inv.id, sessionId: p.sessionId, amount: p.amount, time: p.time, outcome: p.outcome };
}

export interface IncomingPayment {
  transactionId: string;
  aliasAccountReference: string | null;
  amount: number;
  sender: string;
  senderAccountNumber?: string;
  senderBankCode?: string;
  bankName?: string;
  narration?: string;
  time?: string;
  fallbackTenantId?: string;
  sessionId?: string;        // Nomba bank-network session ID — persisted for requery
}
export interface ApplyResult {
  outcome: PaymentOutcome;
  invoiceId: string | null;
  event: FeedEvent;
}

/**
 * Apply an incoming payment atomically: dedupe on transactionId (unique seenTx), match by
 * aliasAccountReference, reconcile, append the feed event, chain audit — all in one transaction.
 * A replayed webhook is a no-op ("duplicate"); a mid-flight failure rolls back so Nomba's retry
 * reprocesses it cleanly.
 */
export async function applyPayment(p: IncomingPayment): Promise<ApplyResult> {
  const time = p.time ?? new Date().toISOString();
  if (!p.transactionId) throw new Error("applyPayment: missing transactionId");
  if (!isValidAmount(p.amount)) throw new Error(`applyPayment: invalid amount ${p.amount}`);

  return withTxn(async (session, c) => {
    if (await c.seenTx.findOne({ _id: p.transactionId }, { session })) {
      const existing = await c.events.findOne({ id: p.transactionId }, { session, projection: { _id: 0 } });
      return { outcome: "duplicate" as const, invoiceId: existing?.invoiceId ?? null, event: existing ?? mkEvent(p, null, "duplicate", time, p.fallbackTenantId ?? DEMO_TENANT_ID) };
    }
    const invoice = p.aliasAccountReference ? await c.invoices.findOne({ id: p.aliasAccountReference }, { session, projection: { _id: 0 } }) : null;

    let event: FeedEvent;
    let outcome: PaymentOutcome;
    let invoiceId: string | null;

    if (!invoice) {
      event = mkEvent(p, null, "quarantine", time, p.fallbackTenantId ?? DEMO_TENANT_ID);
      outcome = "quarantine";
      invoiceId = null;
    } else {
      const cl = classify(invoice.amount, invoice.paid, p.amount);
      const payment: Payment = {
        transactionId: p.transactionId, amount: p.amount, sender: p.sender,
        senderAccountNumber: p.senderAccountNumber, senderBankCode: p.senderBankCode,
        bankName: p.bankName, narration: p.narration, time, outcome: cl.status,
        sessionId: p.sessionId,
      };
      await c.invoices.updateOne({ id: invoice.id }, { $set: { paid: cl.newPaid, status: cl.status }, $push: { payments: payment } }, { session });
      event = mkEvent(p, invoice.id, cl.status, time, invoice.tenantId, invoice.customer);
      outcome = cl.status;
      invoiceId = invoice.id;
    }

    await c.events.insertOne({ ...event }, { session });
    await c.seenTx.insertOne({ _id: p.transactionId, at: time }, { session }); // unique → atomic dedupe claim
    await appendAudit(c, session, `payment.${outcome}`, `${p.transactionId} ${invoiceId ?? "unmatched"} ${p.amount}`, time, event.tenantId);
    return { outcome, invoiceId, event };
  });
}

/**
 * Reverse (claw back) a previously-applied payment (`payment_reversal`). Idempotent: reversing an
 * already-reversed payment returns "duplicate".
 */
export async function reversePayment(originalTransactionId: string, time?: string): Promise<ApplyResult> {
  const when = time ?? new Date().toISOString();
  return withTxn(async (session, c) => {
    const inv = await c.invoices.findOne({ "payments.transactionId": originalTransactionId }, { session, projection: { _id: 0 } });
    if (inv) {
      const pmt = inv.payments.find((x) => x.transactionId === originalTransactionId)!;
      if (pmt.outcome === "reversed") {
        const existing = await c.events.findOne({ id: `rev_${originalTransactionId}` }, { session, projection: { _id: 0 } });
        return { outcome: "duplicate" as const, invoiceId: inv.id, event: existing ?? mkReversalEvent(inv, pmt, when) };
      }
      const r = reverse(inv.amount, inv.paid, pmt.amount);
      await c.invoices.updateOne(
        { id: inv.id, "payments.transactionId": originalTransactionId },
        { $set: { paid: r.newPaid, status: r.status, "payments.$.outcome": "reversed" } },
        { session },
      );
      const event = mkReversalEvent(inv, pmt, when);
      await c.events.insertOne({ ...event }, { session });
      await appendAudit(c, session, "payment.reversed", `${originalTransactionId} ${inv.id} ${pmt.amount}`, when, inv.tenantId);
      return { outcome: "reversed" as const, invoiceId: inv.id, event };
    }
    // No matching payment — informational unmatched reversal, idempotent on the synthetic id.
    const revId = `rev_${originalTransactionId}`;
    const existingRev = await c.events.findOne({ id: revId }, { session, projection: { _id: 0 } });
    if (existingRev) return { outcome: "duplicate" as const, invoiceId: null, event: existingRev };
    const event: FeedEvent = { id: revId, tenantId: DEMO_TENANT_ID, invoiceId: null, customer: "Reversal", amount: 0, narration: `Reversal for unknown transaction ${originalTransactionId}`, outcome: "reversed", time: when };
    await c.events.insertOne({ ...event }, { session });
    await appendAudit(c, session, "payment.reversed.unmatched", `${originalTransactionId} unmatched 0`, when);
    return { outcome: "reversed" as const, invoiceId: null, event };
  });
}

function mkReversalEvent(inv: Invoice, p: Payment, time: string): FeedEvent {
  return { id: `rev_${p.transactionId}`, tenantId: inv.tenantId, invoiceId: inv.id, customer: inv.customer, amount: p.amount, bankName: p.bankName, narration: `Payment reversed — ₦${Math.round(p.amount).toLocaleString()} clawed back`, outcome: "reversed", time };
}

/** Mark an overpaid invoice's surplus as refunded (after a successful payout). Tenant-enforced. */
export async function markRefunded(invoiceId: string, tenantId?: string): Promise<{ invoice: Invoice; refunded: number } | null> {
  return withTxn(async (session, c) => {
    const q = tenantId ? { id: invoiceId, tenantId } : { id: invoiceId };
    const inv = await c.invoices.findOne(q, { session, projection: { _id: 0 } });
    if (!inv || inv.status !== "overpaid") return null;
    const refunded = Math.round((inv.paid - inv.amount) * 100) / 100;
    await c.invoices.updateOne({ id: invoiceId }, { $set: { paid: inv.amount, status: "paid" } }, { session });
    const refundTime = new Date().toISOString();
    await c.events.insertOne({ id: `refund_${invoiceId}_${crypto.randomBytes(4).toString("hex")}`, tenantId: inv.tenantId, invoiceId, customer: inv.customer, amount: refunded, bankName: inv.payments[inv.payments.length - 1]?.bankName, narration: "Refund sent to payer", outcome: "refunded", time: refundTime }, { session });
    await appendAudit(c, session, "refund", `${invoiceId} ${refunded}`, refundTime, inv.tenantId);
    return { invoice: { ...inv, paid: inv.amount, status: "paid" }, refunded };
  });
}

/**
 * WRITE-AHEAD payout record. Called BEFORE the Nomba transfer so the amount is reserved the instant
 * we commit to moving it. Idempotent on (id, tenantId): a replayed ref returns the ORIGINAL record.
 */
export async function recordWithdrawal(
  input: Omit<Withdrawal, "time" | "status" | "live"> & { time?: string; status?: WithdrawalStatus; live?: boolean },
): Promise<Withdrawal> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid withdrawal amount");
  const status: WithdrawalStatus = input.status ?? "pending";
  const w: Withdrawal = { ...input, amount, status, live: input.live ?? status === "settled", time: input.time ?? new Date().toISOString() };
  return withTxn(async (session, c) => {
    const existing = await c.withdrawals.findOne({ id: input.id, tenantId: input.tenantId }, { session, projection: { _id: 0 } });
    if (existing) return existing;
    await c.withdrawals.insertOne({ ...w }, { session });
    await c.events.insertOne({ id: `evt_${w.id}`, tenantId: w.tenantId, invoiceId: null, customer: `Payout → ${w.accountName}`, amount: w.amount, bankName: `•••• ${w.accountNumber.slice(-4)}`, narration: w.live ? "Withdrawal to your bank" : "Withdrawal (demo)", outcome: "withdrawal", time: w.time }, { session });
    await appendAudit(c, session, "withdrawal.record", `${w.id} ${w.amount} ${w.status} -> ${w.bankCode}/${w.accountNumber}`, w.time, w.tenantId);
    return w;
  });
}

/**
 * ATOMIC check-and-reserve for the LIVE withdraw path — the multi-instance-safe replacement for the
 * old single-process event-loop critical section. Inside one transaction it (1) takes a per-tenant
 * write-lock (concurrent reserves for the same tenant conflict on it → withTxn retries with a fresh
 * snapshot, serializing them), (2) recomputes the ledger ceiling, (3) inserts the reserving `pending`
 * record only if the amount still fits. Two concurrent DISTINCT-ref payouts can no longer both pass
 * the check before either reserves. `potCap` is the external Nomba-balance ceiling (null = unknown).
 * Idempotent on (id, tenantId).
 */
export async function reserveWithdrawalAtomic(
  input: Omit<Withdrawal, "time" | "status" | "live"> & { time?: string; narration: string },
  potCap: number | null,
): Promise<{ ok: true; withdrawal: Withdrawal } | { ok: false; cap: number }> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid withdrawal amount");
  return withTxn(async (session, c) => {
    // (1) Serialize concurrent reserves for this tenant — a write-conflict here aborts+retries the txn.
    await c.meta.updateOne({ _id: `wlock:${input.tenantId}` }, { $inc: { value: 1 } }, { upsert: true, session });
    const existing = await c.withdrawals.findOne({ id: input.id, tenantId: input.tenantId }, { session, projection: { _id: 0 } });
    if (existing) return { ok: true as const, withdrawal: existing };
    // (2) Recompute the ledger ceiling from committed state (this snapshot, post-lock).
    const [invoices, wds] = await Promise.all([
      c.invoices.find({ tenantId: input.tenantId }, { session, projection: { paid: 1, amount: 1, _id: 0 } }).toArray(),
      c.withdrawals.find({ tenantId: input.tenantId, status: { $ne: "failed" } }, { session, projection: { amount: 1, _id: 0 } }).toArray(),
    ]);
    const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0);
    const reserved = wds.reduce((a, w) => a + w.amount, 0);
    const ledgerNet = Math.max(Math.round((collected - reserved) * 100) / 100, 0);
    const cap = potCap != null ? Math.min(ledgerNet, potCap) : ledgerNet;
    if (amount > cap) return { ok: false as const, cap: Math.round(cap * 100) / 100 };
    // (3) Reserve.
    const w: Withdrawal = { ...input, amount, status: "pending", live: false, time: input.time ?? new Date().toISOString() };
    await c.withdrawals.insertOne({ ...w }, { session });
    await c.events.insertOne({ id: `evt_${w.id}`, tenantId: w.tenantId, invoiceId: null, customer: `Payout → ${w.accountName}`, amount: w.amount, bankName: `•••• ${w.accountNumber.slice(-4)}`, narration: "Withdrawal to your bank", outcome: "withdrawal", time: w.time }, { session });
    await appendAudit(c, session, "withdrawal.record", `${w.id} ${w.amount} pending -> ${w.bankCode}/${w.accountNumber}`, w.time, w.tenantId);
    return { ok: true as const, withdrawal: w };
  });
}

/** Resolve a pending payout to its final state. `failed` frees the reserved balance. */
export async function updateWithdrawalStatus(id: string, status: WithdrawalStatus, opts?: { live?: boolean; tenantId?: string }): Promise<Withdrawal | null> {
  return withTxn(async (session, c) => {
    const q = opts?.tenantId ? { id, tenantId: opts.tenantId } : { id };
    const w = await c.withdrawals.findOne(q, { session, projection: { _id: 0 } });
    if (!w) return null;
    if (w.status === status) return w;
    const live = opts?.live ?? status === "settled";
    const updatedAt = new Date().toISOString();
    await c.withdrawals.updateOne({ id: w.id, tenantId: w.tenantId }, { $set: { status, live, updatedAt } }, { session });
    await appendAudit(c, session, "withdrawal.status", `${w.id} -> ${status}${live ? " (live)" : ""}`, updatedAt, w.tenantId);
    return { ...w, status, live, updatedAt };
  });
}

export async function listWithdrawals(tenantId: string): Promise<Withdrawal[]> {
  const c = await ready();
  return c.withdrawals.find({ tenantId }, NO_ID).sort({ time: -1 }).toArray();
}

// ── Account management (settings) ──────────────────────────────────────────────────────────────

/** Rename the workspace — the beneficiary name payers see on future invoices/VAs. */
export async function updateBusinessName(tenantId: string, businessName: string): Promise<Tenant | null> {
  return withTxn(async (session, c) => {
    const t = await c.tenants.findOne({ id: tenantId }, { session, projection: { _id: 0 } });
    if (!t) return null;
    await c.tenants.updateOne({ id: tenantId }, { $set: { businessName } }, { session });
    await appendAudit(c, session, "tenant.renamed", `${tenantId} "${t.businessName}" -> "${businessName}"`, new Date().toISOString(), tenantId);
    return { ...t, businessName };
  });
}

/** Set a new password hash and bump tokenVersion — every outstanding session token minted under the
 *  old password dies instantly. Returns the updated user so the caller can re-mint the CURRENT
 *  session cookie (otherwise the operator changing their password would log themselves out). */
export async function changePassword(userId: string, newHash: string): Promise<User | null> {
  return withTxn(async (session, c) => {
    const u = await c.users.findOne({ id: userId }, { session, projection: { _id: 0 } });
    if (!u) return null;
    const tokenVersion = u.tokenVersion + 1;
    await c.users.updateOne({ id: userId }, { $set: { passwordHash: newHash, tokenVersion } }, { session });
    await appendAudit(c, session, "user.password_changed", userId, new Date().toISOString(), u.tenantId);
    return { ...u, passwordHash: newHash, tokenVersion };
  });
}

export type WipeRefusal = "not_found" | "demo_workspace" | "payout_in_flight";
export interface WipeCounts { invoices: number; events: number; withdrawals: number }

/** Money-safety gate shared by the two destructive account operations: never touch the judged demo
 *  workspace, and never erase a ledger while a payout is still in flight (a `pending` withdrawal
 *  means money may be mid-air at Nomba — deleting its record would orphan real money). The audit
 *  chain and the seenTx dedupe set are append-only history and are deliberately KEPT: erasing them
 *  would break the tamper-evident hash chain and re-open webhook replays. */
async function refuseWipe(c: Collections, session: ClientSession, tenantId: string): Promise<WipeRefusal | null> {
  if (tenantId === DEMO_TENANT_ID) return "demo_workspace";
  if (!(await c.tenants.findOne({ id: tenantId }, { session, projection: { _id: 0 } }))) return "not_found";
  if (await c.withdrawals.findOne({ tenantId, status: "pending" }, { session, projection: { _id: 0 } })) return "payout_in_flight";
  return null;
}

async function wipeLedgerData(c: Collections, session: ClientSession, tenantId: string): Promise<WipeCounts> {
  const [inv, ev, wd] = await Promise.all([
    c.invoices.deleteMany({ tenantId }, { session }),
    c.events.deleteMany({ tenantId }, { session }),
    c.withdrawals.deleteMany({ tenantId }, { session }),
  ]);
  await c.flags.deleteMany({ tenantId }, { session });
  return { invoices: inv.deletedCount, events: ev.deletedCount, withdrawals: wd.deletedCount };
}

/** Erase a workspace's ledger (invoices, feed, payouts, flags) but keep the account itself —
 *  "start fresh". Future payments to a wiped invoice's VA quarantine instead of vanishing. */
export async function clearWorkspaceData(tenantId: string): Promise<{ ok: true; removed: WipeCounts } | { ok: false; reason: WipeRefusal }> {
  return withTxn(async (session, c) => {
    const refusal = await refuseWipe(c, session, tenantId);
    if (refusal) return { ok: false as const, reason: refusal };
    const removed = await wipeLedgerData(c, session, tenantId);
    await appendAudit(c, session, "workspace.cleared", `${tenantId} invoices=${removed.invoices} events=${removed.events} withdrawals=${removed.withdrawals}`, new Date().toISOString(), tenantId);
    return { ok: true as const, removed };
  });
}

/** Delete the whole account: ledger data, then the user(s) and the tenant itself. Irreversible. */
export async function deleteAccount(tenantId: string): Promise<{ ok: true; removed: WipeCounts } | { ok: false; reason: WipeRefusal }> {
  return withTxn(async (session, c) => {
    const refusal = await refuseWipe(c, session, tenantId);
    if (refusal) return { ok: false as const, reason: refusal };
    const removed = await wipeLedgerData(c, session, tenantId);
    await c.users.deleteMany({ tenantId }, { session });
    await c.tenants.deleteOne({ id: tenantId }, { session });
    await appendAudit(c, session, "tenant.deleted", `${tenantId} invoices=${removed.invoices} events=${removed.events} withdrawals=${removed.withdrawals}`, new Date().toISOString(), tenantId);
    return { ok: true as const, removed };
  });
}

// ── Anomaly-flag acknowledgement ───────────────────────────────────────────────────────────────

export async function acknowledgeFlag(tenantId: string, key: string): Promise<void> {
  const c = await ready();
  const _id = `${tenantId}:${key}`;
  const res = await c.flags.updateOne({ _id }, { $setOnInsert: { _id, tenantId, key } as FlagDoc }, { upsert: true });
  if (res.upsertedCount) await withTxn(async (session, cc) => { await appendAudit(cc, session, "flag.acknowledged", key, new Date().toISOString(), tenantId); });
}
export async function unacknowledgeFlag(tenantId: string, key: string): Promise<void> {
  const c = await ready();
  await c.flags.deleteOne({ _id: `${tenantId}:${key}` });
}
export async function acknowledgedFlagKeys(tenantId: string): Promise<Set<string>> {
  const c = await ready();
  const rows = await c.flags.find({ tenantId }).toArray();
  return new Set(rows.map((f) => f.key));
}

/**
 * Net settled collections a tenant may pay out: sum of min(paid, amount) over their invoices, minus
 * every payout that is pending OR settled (only `failed` frees its reserve). Ledger figure; the
 * route additionally caps by the real Nomba balance.
 */
export async function tenantWithdrawable(tenantId: string): Promise<number> {
  const c = await ready();
  const [invoices, withdrawals] = await Promise.all([
    c.invoices.find({ tenantId }, { projection: { paid: 1, amount: 1, _id: 0 } }).toArray(),
    c.withdrawals.find({ tenantId, status: { $ne: "failed" } }, { projection: { amount: 1, _id: 0 } }).toArray(),
  ]);
  const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0);
  const reserved = withdrawals.reduce((a, w) => a + w.amount, 0);
  return Math.max(Math.round((collected - reserved) * 100) / 100, 0);
}

function mkEvent(p: IncomingPayment, invoiceId: string | null, outcome: PaymentOutcome, time: string, tenantId: string, customer?: string): FeedEvent {
  return { id: p.transactionId, tenantId, invoiceId, customer: customer ?? p.sender, amount: p.amount, bankName: p.bankName, narration: p.narration ?? `Transfer from ${p.sender}`, outcome, time, senderAccountNumber: p.senderAccountNumber, senderBankCode: p.senderBankCode };
}

export async function getEvent(transactionId: string): Promise<FeedEvent | undefined> {
  const c = await ready();
  return (await c.events.findOne({ id: transactionId }, NO_ID)) ?? undefined;
}

/** Resolve an unmatched (quarantined) payment by assigning it to an invoice. Tenant-enforced. */
export async function resolveQuarantineToInvoice(transactionId: string, invoiceId: string, tenantId?: string):
  Promise<{ invoice: Invoice; outcome: PaymentOutcome } | null> {
  return withTxn(async (session, c) => {
    const ev = await c.events.findOne({ id: transactionId }, { session, projection: { _id: 0 } });
    if (!ev || ev.outcome !== "quarantine") return null;
    const inv = await c.invoices.findOne({ id: invoiceId }, { session, projection: { _id: 0 } });
    if (!inv) return null;
    if (tenantId && (ev.tenantId !== tenantId || inv.tenantId !== tenantId)) return null;

    const cl = classify(inv.amount, inv.paid, ev.amount);
    const payment: Payment = { transactionId: ev.id, amount: ev.amount, sender: ev.customer, senderAccountNumber: ev.senderAccountNumber, senderBankCode: ev.senderBankCode, bankName: ev.bankName, narration: ev.narration, time: ev.time, outcome: cl.status };
    await c.invoices.updateOne({ id: inv.id }, { $set: { paid: cl.newPaid, status: cl.status }, $push: { payments: payment } }, { session });
    await c.events.updateOne({ id: transactionId }, { $set: { invoiceId: inv.id, outcome: cl.status, tenantId: inv.tenantId } }, { session });
    await appendAudit(c, session, `quarantine.assigned.${cl.status}`, `${transactionId} ${inv.id} ${ev.amount}`, ev.time, inv.tenantId);
    return { invoice: { ...inv, paid: cl.newPaid, status: cl.status }, outcome: cl.status };
  });
}

/** Mark a quarantined payment as bounced back to the sender (after a successful payout). Tenant-enforced. */
export async function markQuarantineBounced(transactionId: string, tenantId?: string): Promise<FeedEvent | null> {
  return withTxn(async (session, c) => {
    const ev = await c.events.findOne({ id: transactionId }, { session, projection: { _id: 0 } });
    if (!ev || ev.outcome !== "quarantine") return null;
    if (tenantId && ev.tenantId !== tenantId) return null;
    await c.events.updateOne({ id: transactionId }, { $set: { outcome: "refunded", narration: "Bounced back to sender — no matching invoice" } }, { session });
    await appendAudit(c, session, "quarantine.bounced", `${transactionId} ${ev.amount}`, new Date().toISOString(), ev.tenantId);
    return { ...ev, outcome: "refunded", narration: "Bounced back to sender — no matching invoice" };
  });
}
