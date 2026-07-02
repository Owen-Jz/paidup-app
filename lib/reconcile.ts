// The reconciliation engine — the judged core. Pure + unit-tested in reconcile.test.ts.
// Mirrors smoke-test/smoke-test.mjs reconcile(), generalized for partial accumulation.
//
// Money is held as Naira numbers and every arithmetic point is round2()-guarded to absorb
// floating-kobo drift from bank rails. Integer-kobo end-to-end is the ideal (see GAPS.md #21)
// but for a 7-day MVP the guarded-rounding approach is deliberate and tested.

import type { InvoiceStatus } from "./types";

export interface Classification {
  status: InvoiceStatus;     // resulting invoice status after applying `incoming`
  newPaid: number;           // accumulated total after this payment
  balance: number;           // amount still owed (0 if paid/overpaid)
  overpaidBy: number;        // amount over the expected (0 unless overpaid)
}

export function isValidAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Classify an incoming payment against an invoice.
 * exact  -> paid · less -> partial (balance owed) · more -> overpaid (overpaidBy = refundable surplus).
 * Throws on non-finite/negative inputs so a bad webhook can never silently corrupt the ledger as NaN.
 */
export function classify(
  expected: number,
  alreadyPaid: number,
  incoming: number,
  tolerance = 0.01
): Classification {
  if (!Number.isFinite(expected) || !Number.isFinite(alreadyPaid) || !isValidAmount(incoming)) {
    throw new Error(`classify: invalid inputs (expected=${expected}, alreadyPaid=${alreadyPaid}, incoming=${incoming})`);
  }
  const newPaid = round2(alreadyPaid + incoming);
  const diff = round2(newPaid - expected);

  if (Math.abs(diff) <= tolerance) {
    return { status: "paid", newPaid: expected, balance: 0, overpaidBy: 0 };
  }
  if (diff < 0) {
    return { status: "partial", newPaid, balance: round2(-diff), overpaidBy: 0 };
  }
  return { status: "overpaid", newPaid, balance: 0, overpaidBy: diff };
}

/** Derive an invoice's status from its expected total and accumulated paid amount. */
export function statusFor(expected: number, paid: number, tolerance = 0.01): InvoiceStatus {
  if (paid <= tolerance) return "awaiting";
  if (Math.abs(paid - expected) <= tolerance) return "paid";
  return paid < expected ? "partial" : "overpaid";
}

/**
 * Reverse (claw back) a previously-applied payment — e.g. a `payment_reversal` webhook.
 * Subtracts the reversed amount (clamped at 0) and re-derives the status. Pure + tested so the
 * ledger stays correct when money that was counted gets pulled back.
 */
export function reverse(expected: number, paid: number, reversedAmount: number): { newPaid: number; status: InvoiceStatus } {
  if (!Number.isFinite(expected) || !Number.isFinite(paid) || !isValidAmount(reversedAmount)) {
    throw new Error(`reverse: invalid inputs (expected=${expected}, paid=${paid}, reversedAmount=${reversedAmount})`);
  }
  const newPaid = round2(Math.max(0, paid - reversedAmount));
  return { newPaid, status: statusFor(expected, newPaid) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
