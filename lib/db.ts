// MongoDB connection — the single shared client for the whole app. Cached on globalThis so Next's
// dev hot-reload and serverless invocations REUSE one pooled connection instead of opening a new
// one per request (the classic Next.js + Mongo footgun). Every collection the ledger uses is typed
// and indexed here, so the money-path invariants (dedupe, unique tokens/emails) are enforced by the
// database itself, not just application code.

import { MongoClient, type Db, type Collection } from "mongodb";
import type { Invoice, FeedEvent, Tenant, User, Withdrawal } from "./types";
import type { AuditEntry } from "./audit.ts";

// Read env LAZILY (inside the getters), not at module load — so a test can point MONGODB_DB at a
// throwaway database after importing the store, regardless of ES-module import hoisting.
function uri(): string { return process.env.MONGODB_URI || ""; }
function dbName(): string { return process.env.MONGODB_DB || "paidup"; }

// ── Persisted document shapes ─────────────────────────────────────────────────────────────────
// The ledger is document-native: an Invoice already embeds its payments[]/lineItems[], so each
// collection maps 1:1 to the in-memory model — no normalization, no joins on the money path.
export interface SeenTxDoc { _id: string; at: string } // _id = transactionId (unique = atomic dedupe)
export interface FlagDoc { _id: string; tenantId: string; key: string } // _id = `${tenantId}:${key}`
export interface MetaDoc { _id: string; value: number } // singletons like the invoice sequence

export interface Collections {
  invoices: Collection<Invoice>;
  events: Collection<FeedEvent>;
  seenTx: Collection<SeenTxDoc>;
  withdrawals: Collection<Withdrawal>;
  tenants: Collection<Tenant>;
  users: Collection<User>;
  audit: Collection<AuditEntry>;
  flags: Collection<FlagDoc>;
  meta: Collection<MetaDoc>;
}

const g = globalThis as unknown as { __paidupMongo?: Promise<MongoClient> };

function clientPromise(): Promise<MongoClient> {
  if (!g.__paidupMongo) {
    const u = uri();
    if (!u) {
      // Fail loud in prod — a missing URI must never silently fall back to an empty ledger.
      if (process.env.NODE_ENV === "production") throw new Error("MONGODB_URI is required in production");
      throw new Error("MONGODB_URI is not set (add it to .env.local)");
    }
    g.__paidupMongo = new MongoClient(u, {
      serverSelectionTimeoutMS: 8000,
      // Modest pool — a single VPS instance; raise if we ever scale out horizontally (which is the
      // whole point of moving off the file store).
      maxPoolSize: 10,
    }).connect();
  }
  return g.__paidupMongo;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName());
}

export async function collections(): Promise<Collections> {
  const db = await getDb();
  return {
    invoices: db.collection<Invoice>("invoices"),
    events: db.collection<FeedEvent>("events"),
    seenTx: db.collection<SeenTxDoc>("seenTx"),
    withdrawals: db.collection<Withdrawal>("withdrawals"),
    tenants: db.collection<Tenant>("tenants"),
    users: db.collection<User>("users"),
    audit: db.collection<AuditEntry>("audit"),
    flags: db.collection<FlagDoc>("flags"),
    meta: db.collection<MetaDoc>("meta"),
  };
}

/** Get the shared client (for sessions/transactions). */
export async function getClient(): Promise<MongoClient> {
  return clientPromise();
}

let indexesEnsured = false;
/**
 * Create the indexes that ENFORCE money-path correctness and keep hot lookups O(1). Idempotent and
 * cheap after the first call. The unique index on invoices.id and seenTx._id is what makes dedupe
 * atomic — a replayed webhook hits a duplicate-key error instead of a race.
 */
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const c = await collections();
  await Promise.all([
    c.invoices.createIndex({ id: 1 }, { unique: true }),
    c.invoices.createIndex({ tenantId: 1 }),
    c.invoices.createIndex({ payToken: 1 }, { unique: true, sparse: true }),
    c.invoices.createIndex({ "payments.transactionId": 1 }), // fast reversal lookup
    c.events.createIndex({ id: 1 }),
    c.events.createIndex({ tenantId: 1, time: -1 }),
    c.events.createIndex({ outcome: 1 }),
    c.withdrawals.createIndex({ id: 1, tenantId: 1 }),
    c.withdrawals.createIndex({ tenantId: 1, time: -1 }),
    c.tenants.createIndex({ id: 1 }, { unique: true }),
    c.users.createIndex({ id: 1 }, { unique: true }),
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.audit.createIndex({ seq: 1 }, { unique: true }), // unique seq = the hash-chain can't fork under concurrent appends
  ]);
  indexesEnsured = true;
}
