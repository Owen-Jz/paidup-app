// Branded receipt helpers (POLISH M2). Pure + testable. The receipt hash is a SHA-256 over the
// invoice's canonical figures + payment lines, so a receipt is tamper-evident: alter any amount and
// the printed verification code changes. This gives a "signed receipt" feel with no PKI infra.
import crypto from "crypto";
import type { Invoice } from "./types";

export function receiptNumber(inv: Invoice): string {
  return `RCPT-${inv.id.replace(/[^A-Za-z0-9]/g, "")}`;
}

export function receiptHash(inv: Invoice): string {
  const canon = [
    inv.id, inv.customer, inv.amount, inv.paid, inv.status,
    ...inv.payments.map((p) => `${p.transactionId}:${p.amount}:${p.time}:${p.outcome}`),
  ].join("|");
  return crypto.createHash("sha256").update(canon).digest("hex").slice(0, 16);
}
