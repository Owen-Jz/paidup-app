// One-time (idempotent) migration: file-backed .data/ledger.json → MongoDB.
// Usage: node --env-file=.env.local scripts/migrate-ledger.ts [path-to-ledger.json]
//   default path: .data/ledger.json
// Safe to re-run: every write is an upsert keyed by the record's natural id, so a second run
// converges to the same state rather than duplicating. Run this ONCE per environment (locally with
// the dev ledger, and on the VPS with its production ledger.json) before switching that instance to
// Mongo. Prints a summary; never deletes anything already in Mongo.

import fs from "fs";
import path from "path";
import { collections, ensureIndexes } from "../lib/db.ts";
import type { Invoice, FeedEvent, Tenant, User, Withdrawal } from "../lib/types.ts";
import type { AuditEntry } from "../lib/audit.ts";

interface LedgerFile {
  invoices?: Invoice[];
  events?: FeedEvent[];
  seenTx?: string[];
  seq?: number;
  audit?: AuditEntry[];
  tenants?: Tenant[];
  users?: User[];
  withdrawals?: Withdrawal[];
  acknowledgedFlags?: Array<{ tenantId: string; key: string }>;
}

const file = process.argv[2] || path.join(process.cwd(), ".data", "ledger.json");
if (!fs.existsSync(file)) {
  console.error(`No ledger file at ${file} — nothing to migrate (a fresh instance will seed itself).`);
  process.exit(0);
}
const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LedgerFile;

await ensureIndexes();
const c = await collections();

async function upsertMany<T extends object>(
  coll: { bulkWrite: (ops: object[]) => Promise<{ upsertedCount: number; modifiedCount: number }> },
  rows: T[] | undefined,
  keyOf: (r: T) => object,
): Promise<number> {
  if (!rows?.length) return 0;
  const ops = rows.map((r) => ({ updateOne: { filter: keyOf(r), update: { $set: r }, upsert: true } }));
  const res = await coll.bulkWrite(ops);
  return res.upsertedCount + res.modifiedCount;
}

const invoices = await upsertMany(c.invoices as never, raw.invoices, (i) => ({ id: i.id }));
const events = await upsertMany(c.events as never, raw.events, (e) => ({ id: e.id }));
const tenants = await upsertMany(c.tenants as never, raw.tenants, (t) => ({ id: t.id }));
const users = await upsertMany(c.users as never, raw.users, (u) => ({ id: u.id }));
const withdrawals = await upsertMany(c.withdrawals as never, raw.withdrawals, (w) => ({ id: w.id, tenantId: w.tenantId }));
const audit = await upsertMany(c.audit as never, raw.audit, (a) => ({ seq: a.seq }));

// seenTx: string[] → { _id }
let seen = 0;
if (raw.seenTx?.length) {
  const ops = raw.seenTx.map((id) => ({ updateOne: { filter: { _id: id }, update: { $setOnInsert: { _id: id, at: new Date(0).toISOString() } }, upsert: true } }));
  seen = (await (c.seenTx as never as { bulkWrite: (o: object[]) => Promise<{ upsertedCount: number }> }).bulkWrite(ops)).upsertedCount;
}
// acknowledgedFlags → flags { _id: `${tenantId}:${key}` }
let flags = 0;
if (raw.acknowledgedFlags?.length) {
  const ops = raw.acknowledgedFlags.map((f) => ({ updateOne: { filter: { _id: `${f.tenantId}:${f.key}` }, update: { $set: { _id: `${f.tenantId}:${f.key}`, tenantId: f.tenantId, key: f.key } }, upsert: true } }));
  flags = (await (c.flags as never as { bulkWrite: (o: object[]) => Promise<{ upsertedCount: number; modifiedCount: number }> }).bulkWrite(ops)).upsertedCount;
}
// meta.seq — take the MAX of the file's seq and whatever's already there (never rewind the counter).
if (raw.seq != null) {
  const existing = await c.meta.findOne({ _id: "seq" });
  const value = Math.max(raw.seq, existing?.value ?? 0);
  await c.meta.updateOne({ _id: "seq" }, { $set: { value } }, { upsert: true });
}

console.log(`Migrated from ${file}:`);
console.log(`  invoices=${invoices} events=${events} seenTx=${seen} withdrawals=${withdrawals}`);
console.log(`  tenants=${tenants} users=${users} audit=${audit} flags=${flags} seq=${raw.seq ?? "(unset)"}`);
console.log("Done. (idempotent — safe to re-run.)");
process.exit(0);
