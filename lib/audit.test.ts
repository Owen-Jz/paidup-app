import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEntry, verifyChain, hashEntry, GENESIS, type AuditEntry } from "./audit.ts";

function chain(): AuditEntry[] {
  const log: AuditEntry[] = [];
  log.push(appendEntry(log, "invoice.created", "INV-1 Acme 100000", "2026-01-01T00:00:00Z"));
  log.push(appendEntry(log, "payment.partial", "tx1 INV-1 40000", "2026-01-01T00:01:00Z"));
  log.push(appendEntry(log, "payment.paid", "tx2 INV-1 60000", "2026-01-01T00:02:00Z"));
  return log;
}

test("a freshly built chain verifies, with seq + genesis linkage", () => {
  const log = chain();
  assert.equal(log[0].prevHash, GENESIS);
  assert.deepEqual(log.map((e) => e.seq), [1, 2, 3]);
  assert.equal(log[1].prevHash, log[0].hash);
  assert.deepEqual(verifyChain(log), { ok: true, brokenAt: null });
});

test("editing a past entry's detail breaks the chain at that entry", () => {
  const log = chain();
  log[1] = { ...log[1], detail: "tx1 INV-1 999999" }; // attacker inflates an amount
  const v = verifyChain(log);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 1);
});

test("rewriting an entry AND its hash still fails (prevHash linkage breaks the next)", () => {
  const log = chain();
  const forgedBase = { seq: 2, time: log[1].time, type: log[1].type, detail: "tx1 INV-1 999999", prevHash: log[1].prevHash };
  log[1] = { ...forgedBase, hash: hashEntry(forgedBase) }; // self-consistent forgery...
  const v = verifyChain(log);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 2); // ...but entry 3's prevHash no longer matches
});

test("deleting an entry breaks the sequence", () => {
  const log = chain();
  log.splice(1, 1);
  assert.equal(verifyChain(log).ok, false);
});

test("reordering entries breaks the chain", () => {
  const log = chain();
  [log[1], log[2]] = [log[2], log[1]];
  assert.equal(verifyChain(log).ok, false);
});

test("empty chain is trivially valid", () => {
  assert.deepEqual(verifyChain([]), { ok: true, brokenAt: null });
});
