// Anomaly / fraud flags (the moat). A reconciliation engine that only says "paid/partial/overpaid"
// is half a product — money moving wrong is exactly what an operator needs surfaced. This scans the
// ledger for patterns that warrant a human look BEFORE the money is treated as settled. Pure +
// deterministic (no I/O), so it's unit-testable and the flags match what's on screen.
import type { Invoice, FeedEvent } from "./types";

export interface Anomaly {
  severity: "high" | "medium" | "info";
  type: string;
  message: string;
  invoiceId?: string;
  transactionId?: string;
}

const DUP_WINDOW_MS = 10 * 60 * 1000; // two identical transfers within 10 min look like a double-send

function ms(t: string): number {
  const n = Date.parse(t);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Scan invoices + unmatched payments for things worth a second look:
 *  - HIGH  large overpayment (>=150% of the invoice) — possibly misdirected money
 *  - HIGH  possible duplicate transfer (same payer + amount within 10 min, distinct tx)
 *  - MEDIUM repeated unmatched transfers from the same account (a payer who never uses a reference)
 *  - INFO  one payer account settling several different invoices (usually fine; flagged for awareness)
 */
export function scanAnomalies(invoices: Invoice[], quarantine: FeedEvent[]): Anomaly[] {
  const out: Anomaly[] = [];

  for (const inv of invoices) {
    // large overpayment
    if (inv.amount > 0 && inv.paid >= inv.amount * 1.5) {
      out.push({
        severity: "high", type: "large_overpayment", invoiceId: inv.id,
        message: `Received ₦${Math.round(inv.paid).toLocaleString()} on a ₦${Math.round(inv.amount).toLocaleString()} invoice (≥150%) — verify before settling.`,
      });
    }
    // possible duplicate transfer within a short window
    const byKey = new Map<string, typeof inv.payments>();
    for (const p of inv.payments) {
      const key = `${p.senderAccountNumber ?? p.sender}:${Math.round(p.amount)}`;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(p);
    }
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => ms(a.time) - ms(b.time));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].transactionId !== sorted[i - 1].transactionId &&
            ms(sorted[i].time) - ms(sorted[i - 1].time) <= DUP_WINDOW_MS) {
          out.push({
            severity: "high", type: "possible_duplicate", invoiceId: inv.id, transactionId: sorted[i].transactionId,
            message: `Possible duplicate: 2× ₦${Math.round(sorted[i].amount).toLocaleString()} from ${sorted[i].sender} within 10 min.`,
          });
          break;
        }
      }
    }
  }

  // repeated unmatched transfers from one account
  const qByAccount = new Map<string, FeedEvent[]>();
  for (const e of quarantine) {
    const acct = e.senderAccountNumber;
    if (!acct) continue;
    (qByAccount.get(acct) ?? qByAccount.set(acct, []).get(acct)!).push(e);
  }
  for (const [acct, list] of qByAccount) {
    if (list.length >= 2) {
      out.push({
        severity: "medium", type: "repeat_unmatched",
        message: `${list.length} unmatched transfers from account •••${acct.slice(-4)} (${list[0].customer}) — a payer who never includes a reference.`,
      });
    }
  }

  // one payer account paying several distinct invoices (informational)
  const payerInvoices = new Map<string, Set<string>>();
  for (const inv of invoices) {
    for (const p of inv.payments) {
      if (!p.senderAccountNumber) continue;
      (payerInvoices.get(p.senderAccountNumber) ?? payerInvoices.set(p.senderAccountNumber, new Set()).get(p.senderAccountNumber)!).add(inv.id);
    }
  }
  for (const [acct, ids] of payerInvoices) {
    if (ids.size >= 3) {
      out.push({
        severity: "info", type: "multi_invoice_payer",
        message: `One account (•••${acct.slice(-4)}) is settling ${ids.size} invoices — confirm it's the same customer.`,
      });
    }
  }

  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ── AI layer (the moat) ──────────────────────────────────────────────────────────────────────
// Turn each deterministic flag into a plain-English "what to do about it" for a non-technical SME
// operator. ON DEMAND (operator clicks "Explain with AI"), ONE batched MiniMax call for all flags so
// it doesn't re-bill on the poll. Graceful: no key / failure / misaligned output → flags returned
// unchanged (the static message still shows). Injectable chatFn → unit-testable offline.

type ChatJSONFn = <T = unknown>(
  user: string,
  opts?: { system?: string; temperature?: number; maxTokens?: number; timeoutMs?: number },
) => Promise<T | null>;

export interface ExplainedAnomaly extends Anomaly {
  recommendation?: string; // one short actionable sentence, AI-generated
}

interface AiRec { index: number; recommendation: string }

export async function explainAnomalies(anomalies: Anomaly[], chatFn?: ChatJSONFn): Promise<ExplainedAnomaly[]> {
  if (!anomalies.length) return anomalies.map((a) => ({ ...a }));
  const chat: ChatJSONFn = chatFn ?? ((await import("./ai")).chatJSON as ChatJSONFn);

  const list = anomalies.map((a, i) => `${i}. [${a.severity}] ${a.type} — ${a.message}`).join("\n");
  const prompt =
`You help a Nigerian SME operator reconcile bank transfers. Below are flags our system raised on the
ledger. For EACH flag, write ONE short, concrete next action the operator should take (max ~18 words,
plain English, no jargon). Do not invent facts beyond the flag.

FLAGS
${list}

Respond with ONLY a JSON array, one object per flag:
[{"index":0,"recommendation":"<one short action>"}, ...]`;

  const out = await chat<AiRec[]>(prompt, {
    system: "You are a concise reconciliation operations assistant. You answer in strict JSON only.",
    temperature: 0.2,
    maxTokens: 400,
  });

  if (!Array.isArray(out)) return anomalies.map((a) => ({ ...a })); // fallback: no recommendations
  const byIndex = new Map<number, string>();
  for (const o of out) {
    if (o && typeof o.index === "number" && typeof o.recommendation === "string" && o.recommendation.trim()) {
      byIndex.set(o.index, o.recommendation.trim().slice(0, 220));
    }
  }
  return anomalies.map((a, i) => ({ ...a, recommendation: byIndex.get(i) }));
}
