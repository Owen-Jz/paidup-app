// AI reconciliation brief (the moat). Turns the whole ledger into a plain-English digest an SME owner
// can read in five seconds — "where's my money, what needs me". Two layers:
//   • snapshot()        — pure, deterministic ledger roll-up (also unit-tested)
//   • templatedSummary()— pure, deterministic prose (ALWAYS available; the graceful fallback)
//   • aiSummary()       — MiniMax writes a warmer, sharper brief over the SAME numbers; on any
//                         failure it returns the templated text. Grounded: the model only gets the
//                         computed figures, so it can't invent money. Injectable chatFn for tests.
import type { Invoice, FeedEvent } from "./types";

export interface LedgerSnapshot {
  count: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  paid: number;
  partial: number;
  awaiting: number;
  overpaid: number;
  unmatched: number;
  collectionRate: number; // %
  topOutstanding: Array<{ id: string; customer: string; balance: number }>;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export function snapshot(invoices: Invoice[], quarantine: FeedEvent[]): LedgerSnapshot {
  const invoiced = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0)
    + invoices.filter((i) => i.status === "overpaid").reduce((a, i) => a + (i.paid - i.amount), 0);
  const outstanding = invoices.reduce((a, i) => a + Math.max(i.amount - i.paid, 0), 0);
  const by = (s: Invoice["status"]) => invoices.filter((i) => i.status === s).length;
  const topOutstanding = invoices
    .filter((i) => i.paid < i.amount)
    .map((i) => ({ id: i.id, customer: i.customer, balance: i.amount - i.paid }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 3);
  return {
    count: invoices.length, invoiced, collected, outstanding,
    paid: by("paid"), partial: by("partial"), awaiting: by("awaiting"), overpaid: by("overpaid"),
    unmatched: quarantine.length,
    collectionRate: invoiced ? Math.round((collected / invoiced) * 100) : 0,
    topOutstanding,
  };
}

/** Deterministic prose — the fallback that always works (no key, no network). */
export function templatedSummary(s: LedgerSnapshot): string {
  const parts: string[] = [];
  parts.push(
    `You've collected ${naira(s.collected)} of ${naira(s.invoiced)} across ${s.count} invoice${s.count === 1 ? "" : "s"} (${s.collectionRate}%). ` +
    `${naira(s.outstanding)} is still outstanding.`,
  );
  const attn: string[] = [];
  if (s.overpaid) attn.push(`${s.overpaid} overpaid (refund the surplus)`);
  if (s.unmatched) attn.push(`${s.unmatched} unmatched transfer${s.unmatched === 1 ? "" : "s"} to resolve`);
  if (s.partial) attn.push(`${s.partial} part-paid`);
  if (attn.length) parts.push(`Needs attention: ${attn.join(", ")}.`);
  else parts.push(`Nothing needs your attention right now.`);
  if (s.topOutstanding.length) {
    parts.push(`Biggest balance: ${s.topOutstanding[0].customer} (${naira(s.topOutstanding[0].balance)}).`);
  }
  return parts.join(" ");
}

type ChatFn = (
  user: string,
  opts?: { system?: string; temperature?: number; maxTokens?: number; timeoutMs?: number },
) => Promise<string | null>;

export async function aiSummary(
  s: LedgerSnapshot,
  chatFn?: ChatFn,
): Promise<{ summary: string; source: "ai" | "template" }> {
  const fallback = templatedSummary(s);
  const chat: ChatFn = chatFn ?? ((await import("./ai")).chat as ChatFn);

  const facts =
`invoices: ${s.count}
invoiced: ${naira(s.invoiced)}
collected: ${naira(s.collected)} (${s.collectionRate}%)
outstanding: ${naira(s.outstanding)}
status counts: paid ${s.paid}, part-paid ${s.partial}, awaiting ${s.awaiting}, overpaid ${s.overpaid}
unmatched transfers: ${s.unmatched}
top outstanding: ${s.topOutstanding.map((t) => `${t.customer} ${naira(t.balance)}`).join("; ") || "none"}`;

  const prompt =
`Write a short reconciliation brief for a Nigerian SME owner using ONLY these figures (do not invent any):

${facts}

2–3 sentences, warm but factual, plain English. End with the single most important action to take next.
Return just the brief text — no headings, no markdown, no preamble.`;

  const text = await chat(prompt, {
    system: "You are a concise finance assistant for a small business owner. You never invent numbers.",
    temperature: 0.4,
    maxTokens: 240,
  });

  return text && text.trim()
    ? { summary: text.trim().slice(0, 900), source: "ai" }
    : { summary: fallback, source: "template" };
}
