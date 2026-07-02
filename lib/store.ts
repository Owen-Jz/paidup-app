// Ledger store. Durable, file-backed (.data/ledger.json) so a restart can't replay-double-credit
// money — the processed-transactionId set survives. On serverless (read-only / per-invocation fs)
// the write quietly no-ops and it falls back to the in-memory globalThis singleton; before a real
// serverless deploy this should move to Postgres/Redis (see GAPS.md #4). Delete .data/ to reset to seed.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { classify, isValidAmount, reverse } from "./reconcile.ts";
import { appendEntry, verifyChain, type AuditEntry } from "./audit.ts";
import type { Invoice, FeedEvent, Payment, PaymentOutcome } from "./types";

interface StoreShape {
  invoices: Map<string, Invoice>;
  events: FeedEvent[];
  seenTx: Set<string>;
  seq: number;
  audit: AuditEntry[];
}

/** Append a tamper-evident audit entry for a money-affecting action (M3). Secret-free detail. */
function recordAudit(s: StoreShape, type: string, detail: string, time: string): void {
  s.audit.push(appendEntry(s.audit, type, detail, time));
}

const EVENTS_CAP = 200;
// The merchant using PaidUp (single-tenant MVP). This is the beneficiary a payer sees on the pay
// page and the name the dedicated virtual accounts are held under — NOT the payer's own name.
export const BUSINESS_NAME = process.env.BUSINESS_NAME || "Cresiolabs";
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "ledger.json");
const g = globalThis as unknown as { __paidup?: StoreShape };

function seed(): StoreShape {
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
  const inv = (
    id: string, customer: string, description: string, amount: number,
    acctNumber: string, status: Invoice["status"], paid: number
  ): Invoice => ({
    id, customer, description, amount, paid, status,
    createdAt: iso(180), dueLabel: "Due in 5d",
    acctNumber, acctName: `${BUSINESS_NAME}/PaidUp`, bankName: "Nombank MFB",
    payments: [], payToken: `tok_${id.replace(/-/g, "").toLowerCase()}`, // stable demo link for seeds
  });

  const invoices = new Map<string, Invoice>();
  [
    inv("INV-1042", "Dangote Cement Plc", "Bulk cement — 200 bags", 450000, "3049420327", "paid", 450000),
    inv("INV-1043", "Jumia Nigeria", "Q2 logistics retainer", 120000, "9882319033", "partial", 70000),
    inv("INV-1044", "Konga Online", "Storefront redesign", 75500, "7741120385", "awaiting", 0),
    inv("INV-1045", "Food Concepts", "POS install", 38000, "8830014472", "awaiting", 0),
    inv("INV-1046", "MTN Nigeria", "API integration — phase 1", 1250000, "5521190044", "overpaid", 1300000),
    inv("INV-1047", "Andela", "Contractor invoice — May", 300000, "6610329981", "paid", 300000),
  ].forEach((i) => invoices.set(i.id, i));

  const events: FeedEvent[] = [
    { id: "tx_seed1", invoiceId: "INV-1042", customer: "Dangote Cement Plc", amount: 450000, bankName: "GTBank", narration: "Transfer from Dangote", outcome: "paid", time: iso(8) },
    { id: "tx_seed2", invoiceId: "INV-1046", customer: "MTN Nigeria", amount: 1300000, bankName: "Zenith Bank", narration: "Transfer from MTN", outcome: "overpaid", time: iso(22) },
    { id: "tx_seed3", invoiceId: "INV-1043", customer: "Jumia Nigeria", amount: 70000, bankName: "Opay", narration: "Part payment", outcome: "partial", time: iso(40) },
    { id: "tx_seed4", invoiceId: null, customer: "UNKNOWN SENDER", amount: 55000, bankName: "Kuda", narration: '"Pymt for inv 1050"', outcome: "quarantine", time: iso(55) },
  ];
  // seed illustrative payment histories so the statement view is populated
  invoices.get("INV-1043")!.payments.push({
    transactionId: "tx_seed3", amount: 70000, sender: "Jumia Nigeria", bankName: "Opay",
    senderAccountNumber: "8065219824", senderBankCode: "305",
    narration: "Part payment", time: iso(40), outcome: "partial",
  });
  invoices.get("INV-1042")!.payments.push({
    transactionId: "tx_seed1", amount: 450000, sender: "Dangote Cement Plc", bankName: "GTBank",
    senderAccountNumber: "0107841806", senderBankCode: "058",
    narration: "Transfer from Dangote", time: iso(8), outcome: "paid",
  });
  invoices.get("INV-1046")!.payments.push({
    transactionId: "tx_seed2", amount: 1300000, sender: "MTN Nigeria", bankName: "Zenith Bank",
    senderAccountNumber: "1014567890", senderBankCode: "057",
    narration: "Transfer from MTN", time: iso(22), outcome: "overpaid",
  });
  invoices.get("INV-1047")!.payments.push({
    transactionId: "tx_seed5", amount: 300000, sender: "Andela", bankName: "Access Bank",
    senderAccountNumber: "0691234567", senderBankCode: "044",
    narration: "Contractor invoice — May", time: iso(120), outcome: "paid",
  });

  // Seed a verifiable audit chain from the seed events (chronological order) so /api/audit is
  // immediately non-empty and provably intact in the demo.
  const audit: AuditEntry[] = [];
  for (const e of [...events].reverse()) {
    audit.push(appendEntry(audit, `payment.${e.outcome}`, `${e.id} ${e.invoiceId ?? "unmatched"} ${e.amount}`, e.time));
  }

  return { invoices, events, seenTx: new Set(["tx_seed1", "tx_seed2", "tx_seed3", "tx_seed4"]), seq: 1, audit };
}

function load(): StoreShape | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      invoices: new Map((raw.invoices as Invoice[]).map((i) => [i.id, i])),
      events: raw.events ?? [],
      seenTx: new Set(raw.seenTx ?? []),
      seq: raw.seq ?? 1,
      audit: raw.audit ?? [],
    };
  } catch {
    return null; // corrupt/unreadable -> reseed
  }
}

function persist(s: StoreShape): void {
  if (process.env.PAIDUP_DISABLE_PERSIST === "1") return; // unit tests: never touch the dev ledger
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      invoices: [...s.invoices.values()],
      events: s.events,
      seenTx: [...s.seenTx],
      seq: s.seq,
      audit: s.audit,
    }));
  } catch {
    /* read-only fs (serverless) — stay in-memory; see GAPS.md #4 */
  }
}

function store(): StoreShape {
  if (!g.__paidup) {
    const loaded = load();
    g.__paidup = loaded ?? seed();
    if (!loaded) persist(g.__paidup);
  }
  return g.__paidup;
}

export function listInvoices(): Invoice[] {
  return [...store().invoices.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function getInvoice(id: string): Invoice | undefined {
  return store().invoices.get(id);
}
export function listEvents(limit = 20): FeedEvent[] {
  return store().events.slice(0, limit);
}
export function listQuarantine(): FeedEvent[] {
  return store().events.filter((e) => e.outcome === "quarantine");
}

export interface CreateInvoiceInput {
  customer: string; description: string; amount: number;
  acctNumber: string; acctName: string; bankName: string; ref?: string;
}
/** Monotonic, collision-free invoice ref drawn from the same sequence createInvoice uses. */
export function nextInvoiceRef(): string {
  const s = store();
  return `INV-${1100 + s.seq++}`;
}
export function createInvoice(input: CreateInvoiceInput): Invoice {
  const s = store();
  // Never silently overwrite an existing invoice (which would reuse a live reconciliation key) —
  // if a provided ref already exists, mint a fresh monotonic one instead.
  let id = input.ref ?? `INV-${1100 + s.seq++}`;
  if (input.ref && s.invoices.has(id)) id = `INV-${1100 + s.seq++}`;
  const invoice: Invoice = {
    id, customer: input.customer, description: input.description, amount: input.amount,
    paid: 0, status: "awaiting", createdAt: new Date().toISOString(), dueLabel: "Due in 7d",
    acctNumber: input.acctNumber, acctName: input.acctName, bankName: input.bankName, payments: [],
    payToken: `pay_${crypto.randomBytes(9).toString("hex")}`, // unguessable public link
  };
  s.invoices.set(id, invoice);
  recordAudit(s, "invoice.created", `${id} ${input.customer} ${input.amount}`, invoice.createdAt);
  persist(s);
  return invoice;
}

/** The append-only audit chain (read-only copy) + its integrity verdict (M3). */
export function getAudit(): AuditEntry[] {
  return [...store().audit];
}
export function verifyAudit(): { ok: boolean; brokenAt: number | null } {
  return verifyChain(store().audit);
}

/** Look up an invoice by its public, unguessable pay token (the /pay/<token> page). */
export function getInvoiceByToken(token: string): Invoice | undefined {
  if (!token) return undefined;
  for (const i of store().invoices.values()) if (i.payToken === token) return i;
  return undefined;
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
}

export interface ApplyResult {
  outcome: PaymentOutcome;
  invoiceId: string | null;
  event: FeedEvent;
}

/**
 * Apply an incoming payment: dedupe on transactionId, match by aliasAccountReference, reconcile.
 * seenTx is committed only AFTER the ledger mutation + event push succeed, so a mid-flight throw
 * returns non-2xx and Nomba's retry is reprocessed (not silently swallowed).
 */
export function applyPayment(p: IncomingPayment): ApplyResult {
  const s = store();
  const time = p.time ?? new Date().toISOString();

  if (!p.transactionId) throw new Error("applyPayment: missing transactionId");
  if (!isValidAmount(p.amount)) throw new Error(`applyPayment: invalid amount ${p.amount}`);

  if (s.seenTx.has(p.transactionId)) {
    const existing = s.events.find((e) => e.id === p.transactionId);
    return { outcome: "duplicate", invoiceId: existing?.invoiceId ?? null, event: existing ?? mkEvent(p, null, "duplicate", time) };
  }

  const invoice = p.aliasAccountReference ? s.invoices.get(p.aliasAccountReference) : undefined;

  let event: FeedEvent;
  let outcome: PaymentOutcome;
  let invoiceId: string | null;

  if (!invoice) {
    event = mkEvent(p, null, "quarantine", time);
    outcome = "quarantine";
    invoiceId = null;
  } else {
    const c = classify(invoice.amount, invoice.paid, p.amount);
    invoice.paid = c.newPaid;
    invoice.status = c.status;
    invoice.payments.push({
      transactionId: p.transactionId, amount: p.amount, sender: p.sender,
      senderAccountNumber: p.senderAccountNumber, senderBankCode: p.senderBankCode,
      bankName: p.bankName, narration: p.narration, time, outcome: c.status,
    });
    event = mkEvent(p, invoice.id, c.status, time, invoice.customer);
    outcome = c.status;
    invoiceId = invoice.id;
  }

  s.events.unshift(event);
  if (s.events.length > EVENTS_CAP) s.events.length = EVENTS_CAP;
  s.seenTx.add(p.transactionId); // commit dedupe only after success
  recordAudit(s, `payment.${outcome}`, `${p.transactionId} ${invoiceId ?? "unmatched"} ${p.amount}`, time);
  persist(s);
  return { outcome, invoiceId, event };
}

/**
 * Reverse (claw back) a previously-applied payment — a `payment_reversal` webhook. Finds the payment
 * by its original transactionId, subtracts it, re-derives the invoice status, and records a reversal
 * event. Idempotent: reversing an already-reversed payment is a no-op (returns "duplicate").
 */
export function reversePayment(originalTransactionId: string, time?: string): ApplyResult {
  const s = store();
  const when = time ?? new Date().toISOString();

  for (const inv of s.invoices.values()) {
    const p = inv.payments.find((x) => x.transactionId === originalTransactionId);
    if (!p) continue;
    if (p.outcome === "reversed") {
      const existing = s.events.find((e) => e.id === `rev_${originalTransactionId}`);
      return { outcome: "duplicate", invoiceId: inv.id, event: existing ?? mkReversalEvent(inv, p, when) };
    }
    const r = reverse(inv.amount, inv.paid, p.amount);
    inv.paid = r.newPaid;
    inv.status = r.status;
    p.outcome = "reversed";
    const event = mkReversalEvent(inv, p, when);
    s.events.unshift(event);
    if (s.events.length > EVENTS_CAP) s.events.length = EVENTS_CAP;
    recordAudit(s, "payment.reversed", `${originalTransactionId} ${inv.id} ${p.amount}`, when);
    persist(s);
    return { outcome: "reversed", invoiceId: inv.id, event };
  }

  // No matching payment — record an informational unmatched reversal so it isn't silently dropped.
  const event: FeedEvent = {
    id: `rev_${originalTransactionId}`, invoiceId: null, customer: "Reversal", amount: 0,
    narration: `Reversal for unknown transaction ${originalTransactionId}`, outcome: "reversed", time: when,
  };
  s.events.unshift(event);
  if (s.events.length > EVENTS_CAP) s.events.length = EVENTS_CAP;
  persist(s);
  return { outcome: "reversed", invoiceId: null, event };
}

function mkReversalEvent(inv: Invoice, p: Payment, time: string): FeedEvent {
  return {
    id: `rev_${p.transactionId}`, invoiceId: inv.id, customer: inv.customer, amount: p.amount,
    bankName: p.bankName, narration: `Payment reversed — ₦${Math.round(p.amount).toLocaleString()} clawed back`,
    outcome: "reversed", time,
  };
}

/** Mark an overpaid invoice's surplus as refunded (after a successful payout). */
export function markRefunded(invoiceId: string): { invoice: Invoice; refunded: number } | null {
  const s = store();
  const inv = s.invoices.get(invoiceId);
  if (!inv || inv.status !== "overpaid") return null;
  const refunded = Math.round((inv.paid - inv.amount) * 100) / 100;
  inv.paid = inv.amount;
  inv.status = "paid";
  const refundTime = new Date().toISOString();
  s.events.unshift({
    id: `refund_${invoiceId}_${s.seq++}`, invoiceId, customer: inv.customer, amount: refunded,
    bankName: inv.payments[inv.payments.length - 1]?.bankName, narration: "Refund sent to payer",
    outcome: "refunded", time: refundTime,
  });
  recordAudit(s, "refund", `${invoiceId} ${refunded}`, refundTime);
  persist(s);
  return { invoice: inv, refunded };
}

function mkEvent(p: IncomingPayment, invoiceId: string | null, outcome: PaymentOutcome, time: string, customer?: string): FeedEvent {
  return {
    id: p.transactionId, invoiceId, customer: customer ?? p.sender, amount: p.amount,
    bankName: p.bankName, narration: p.narration ?? `Transfer from ${p.sender}`, outcome, time,
    senderAccountNumber: p.senderAccountNumber, senderBankCode: p.senderBankCode,
  };
}

export function getEvent(transactionId: string): FeedEvent | undefined {
  return store().events.find((e) => e.id === transactionId);
}

/**
 * Resolve an unmatched (quarantined) payment by assigning it to the right invoice.
 * Re-runs the SAME reconcile classification, applies it to the invoice's ledger, and
 * rewrites the event from quarantine → its real outcome. The transactionId is already in
 * seenTx (added when it quarantined), so this never double-counts. (GAPS #9 — unmatched handling.)
 */
export function resolveQuarantineToInvoice(transactionId: string, invoiceId: string):
  { invoice: Invoice; outcome: PaymentOutcome } | null {
  const s = store();
  const ev = s.events.find((e) => e.id === transactionId);
  if (!ev || ev.outcome !== "quarantine") return null;
  const inv = s.invoices.get(invoiceId);
  if (!inv) return null;

  const c = classify(inv.amount, inv.paid, ev.amount);
  inv.paid = c.newPaid;
  inv.status = c.status;
  inv.payments.push({
    transactionId: ev.id, amount: ev.amount, sender: ev.customer,
    senderAccountNumber: ev.senderAccountNumber, senderBankCode: ev.senderBankCode,
    bankName: ev.bankName, narration: ev.narration, time: ev.time, outcome: c.status,
  });
  ev.invoiceId = inv.id;
  ev.outcome = c.status;
  recordAudit(s, `quarantine.assigned.${c.status}`, `${transactionId} ${inv.id} ${ev.amount}`, ev.time);
  persist(s);
  return { invoice: inv, outcome: c.status };
}

/** Mark a quarantined payment as bounced back to the sender (after a successful payout). */
export function markQuarantineBounced(transactionId: string): FeedEvent | null {
  const s = store();
  const ev = s.events.find((e) => e.id === transactionId);
  if (!ev || ev.outcome !== "quarantine") return null;
  ev.outcome = "refunded";
  ev.narration = "Bounced back to sender — no matching invoice";
  recordAudit(s, "quarantine.bounced", `${transactionId} ${ev.amount}`, new Date().toISOString());
  persist(s);
  return ev;
}
