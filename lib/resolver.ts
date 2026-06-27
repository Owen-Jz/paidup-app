// Smart unmatched-payment resolver (the moat). When a transfer lands with no matching
// aliasAccountReference (quarantined), score it against open invoices to SUGGEST the likely
// owner — so a human resolves it in one click instead of guessing. Deterministic + explainable
// (every suggestion carries the reasons that earned it), so it's testable and auditable; an LLM
// can later be layered on top of the same signals. Signals, strongest first:
//   1. narration names an invoice id ("Pymt for inv 1050" → INV-1050)
//   2. amount equals an invoice's outstanding balance, or its full amount
//   3. narration / sender name overlaps the customer's name tokens
import type { FeedEvent, Invoice } from "./types";

export interface MatchSuggestion {
  invoiceId: string;
  score: number;                 // 0..100
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

const STOP = new Set(["plc", "ltd", "limited", "nig", "nigeria", "the", "and", "co", "inc", "enterprises"]);

function nameTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// Pull invoice-id-ish numbers from free text: "inv 1050", "INV-1050", "1050", "#1050".
function numbersIn(text: string): string[] {
  return (text.toLowerCase().match(/\d{3,}/g) ?? []);
}

function near(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= Math.max(1, b * tol);
}

/** Score one invoice as a candidate owner of an unmatched payment. */
export function scoreInvoice(event: FeedEvent, inv: Invoice): MatchSuggestion {
  const reasons: string[] = [];
  let score = 0;
  const balance = Math.max(inv.amount - inv.paid, 0);
  const text = `${event.narration ?? ""} ${event.customer ?? ""}`;

  // 1) narration references this invoice's number
  const invNum = (inv.id.match(/\d{3,}/)?.[0]) ?? "";
  if (invNum && numbersIn(text).includes(invNum)) {
    score += 60;
    reasons.push(`narration mentions “${invNum}”`);
  }

  // 2) amount signals
  if (near(event.amount, inv.amount)) {
    score += 30;
    reasons.push("amount equals the invoice total");
  } else if (balance > 0 && near(event.amount, balance)) {
    score += 28;
    reasons.push("amount equals the outstanding balance");
  } else if (event.amount < inv.amount && event.amount >= inv.amount * 0.25) {
    score += 8;
    reasons.push("amount is a plausible part-payment");
  }

  // 3) name overlap between sender/narration and the customer
  const custTokens = new Set(nameTokens(inv.customer));
  const payerTokens = nameTokens(text);
  const shared = payerTokens.filter((t) => custTokens.has(t));
  if (shared.length) {
    score += Math.min(25, 12 * shared.length);
    reasons.push(`sender name matches “${[...new Set(shared)].join(", ")}”`);
  }

  score = Math.min(100, score);
  const confidence: MatchSuggestion["confidence"] = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { invoiceId: inv.id, score, confidence, reasons };
}

/**
 * Rank open invoices as candidate owners for a quarantined payment.
 * Returns the best suggestions above a noise floor, highest score first. Empty array = no confident guess.
 */
export function suggestMatches(event: FeedEvent, invoices: Invoice[], limit = 3): MatchSuggestion[] {
  // Only invoices that can still receive money are sensible targets.
  const open = invoices.filter((i) => i.paid < i.amount || i.status === "awaiting" || i.status === "partial");
  return open
    .map((inv) => scoreInvoice(event, inv))
    .filter((s) => s.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The single best guess, or null if nothing clears the bar. */
export function bestMatch(event: FeedEvent, invoices: Invoice[]): MatchSuggestion | null {
  return suggestMatches(event, invoices, 1)[0] ?? null;
}

// ── AI layer (the moat) ──────────────────────────────────────────────────────────────────────
// MiniMax reads the same signals and picks the owner with a plain-English reason. It runs ON DEMAND
// (an operator clicks "Ask AI"), never on the 2s poll, so it doesn't re-bill. It is grounded HARD:
// the model may only choose from the open-invoice list, and its pick is re-validated against live
// ledger state before we trust it. No key / error / hallucinated id → deterministic fallback.

export interface ResolvedSuggestion extends MatchSuggestion {
  source: "ai" | "heuristic";
  aiReasoning?: string;
}

interface AiPick {
  invoiceId: string | null;
  confidence?: string;
  reasoning?: string;
}

// Structural type for the MiniMax JSON-chat fn (defined here so this pure module never has to
// statically import ./ai — keeps it loadable under the bare-node test runner; the real impl is
// lazy-loaded only when no chatFn is injected).
type ChatJSONFn = <T = unknown>(
  user: string,
  opts?: { system?: string; temperature?: number; maxTokens?: number; timeoutMs?: number },
) => Promise<T | null>;

/**
 * AI-augmented resolve for one unmatched payment. Returns the chosen invoice with the model's
 * reasoning (`source:"ai"`), or the deterministic best guess (`source:"heuristic"`) when AI is
 * unavailable or its answer doesn't validate. `chatFn` is injectable so the AI seam is unit-testable.
 */
export async function aiResolve(
  event: FeedEvent,
  invoices: Invoice[],
  chatFn?: ChatJSONFn,
): Promise<ResolvedSuggestion | null> {
  // Lazy-load the real MiniMax client only when no chat fn is injected (tests inject a mock, so the
  // import never runs there — that's what keeps this module loadable without bundler resolution).
  const chat: ChatJSONFn = chatFn ?? ((await import("./ai")).chatJSON as ChatJSONFn);
  const open = invoices.filter((i) => i.paid < i.amount || i.status === "awaiting" || i.status === "partial");
  const heuristic = bestMatch(event, invoices); // deterministic baseline + fallback
  const fallback = (): ResolvedSuggestion | null => (heuristic ? { ...heuristic, source: "heuristic" } : null);

  // Strongest scored candidates first, plus a few other open invoices so the model can catch a
  // match the scorer missed. Capped to keep the prompt small + cheap.
  const ranked = suggestMatches(event, invoices, 5);
  const rankedIds = new Set(ranked.map((r) => r.invoiceId));
  const candidates = [
    ...ranked.map((r) => invoices.find((i) => i.id === r.invoiceId)).filter((i): i is Invoice => Boolean(i)),
    ...open.filter((i) => !rankedIds.has(i.id)).slice(0, 5),
  ];
  if (!candidates.length) return fallback();

  const lines = candidates.map((i) => {
    const bal = Math.max(i.amount - i.paid, 0);
    return `- ${i.id} | customer: ${i.customer} | total: ₦${Math.round(i.amount)} | outstanding: ₦${Math.round(bal)} | ${i.description}`;
  }).join("\n");

  const prompt =
`A bank transfer landed with NO invoice reference, so we must infer which invoice it pays.

PAYMENT
  sender name: ${event.customer || "unknown"}
  amount: ₦${Math.round(event.amount)}
  narration: ${event.narration || "(none)"}

OPEN INVOICES (you may ONLY choose from these)
${lines}

Pick the ONE invoice this payment most likely settles, or null if none is a credible match. Weigh:
an invoice number in the narration, the amount equalling a total or outstanding balance, and the
sender name matching the customer. Be conservative — only pick when there is real evidence.

Respond with ONLY JSON:
{"invoiceId":"<id or null>","confidence":"high|medium|low","reasoning":"<one short sentence an operator understands>"}`;

  const pick = await chat<AiPick>(prompt, {
    system: "You are a careful payment-reconciliation assistant. You never invent invoice ids — you only choose from the list given. You answer in strict JSON.",
    temperature: 0.1,
    maxTokens: 200,
  });

  // Trust the model only if it chose a real, still-open invoice.
  if (pick && pick.invoiceId && open.some((i) => i.id === pick.invoiceId)) {
    const base = ranked.find((r) => r.invoiceId === pick.invoiceId)
      ?? scoreInvoice(event, invoices.find((i) => i.id === pick.invoiceId)!);
    const conf = (["high", "medium", "low"] as const).includes(pick.confidence as ResolvedSuggestion["confidence"])
      ? (pick.confidence as ResolvedSuggestion["confidence"])
      : base.confidence;
    return {
      ...base,
      confidence: conf,
      source: "ai",
      aiReasoning: typeof pick.reasoning === "string" && pick.reasoning.trim()
        ? pick.reasoning.trim().slice(0, 240)
        : undefined,
    };
  }

  return fallback();
}
