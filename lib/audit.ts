// Tamper-evident audit trail (POLISH M3). Every money-affecting action appends an entry whose hash
// chains to the previous entry's hash. Editing, reordering, or deleting any past entry breaks the
// chain — verifyChain() pinpoints the first broken link. Pure + sync so it's fully unit-testable and
// shared by the store. This is a Security/Reliability differentiator: the ledger is provably intact.

import crypto from "crypto";

export interface AuditEntry {
  seq: number;        // 1-based position
  time: string;       // ISO timestamp of the action
  type: string;       // e.g. "payment.paid", "refund", "invoice.created"
  detail: string;     // compact, secret-free description (ids/amounts only)
  prevHash: string;   // hash of the previous entry ("GENESIS" for the first)
  hash: string;       // sha256 over the fields above
}

export const GENESIS = "GENESIS";

export function hashEntry(e: Omit<AuditEntry, "hash">): string {
  return crypto.createHash("sha256")
    .update(`${e.seq}|${e.time}|${e.type}|${e.detail}|${e.prevHash}`)
    .digest("hex");
}

/** Build the next entry chained onto `log` (does not mutate `log`). */
export function appendEntry(log: AuditEntry[], type: string, detail: string, time: string): AuditEntry {
  const prev = log[log.length - 1];
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? prev.hash : GENESIS;
  const base = { seq, time, type, detail, prevHash };
  return { ...base, hash: hashEntry(base) };
}

/** Verify the whole chain: sequence, prevHash linkage, and each entry's own hash. */
export function verifyChain(log: AuditEntry[]): { ok: boolean; brokenAt: number | null } {
  let prevHash = GENESIS;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const reHash = hashEntry({ seq: e.seq, time: e.time, type: e.type, detail: e.detail, prevHash: e.prevHash });
    if (e.seq !== i + 1 || e.prevHash !== prevHash || e.hash !== reHash) {
      return { ok: false, brokenAt: i };
    }
    prevHash = e.hash;
  }
  return { ok: true, brokenAt: null };
}
