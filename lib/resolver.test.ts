import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestMatches, bestMatch, scoreInvoice, aiResolve } from "./resolver.ts";
import type { FeedEvent, Invoice } from "./types.ts";

// A mock MiniMax chat that returns a fixed pick — lets us test the AI seam offline (no network,
// no key). Proves the contract: AI augments, deterministic fallback when the answer doesn't validate.
const mockChat = (pick: unknown) => (async () => pick) as any;

function inv(id: string, customer: string, amount: number, paid = 0, status: Invoice["status"] = "awaiting"): Invoice {
  return {
    id, tenantId: "ten_test", customer, description: "", amount, paid, status, createdAt: "",
    acctNumber: "0000000000", acctName: "x", bankName: "y", payments: [],
  };
}
function ev(narration: string, amount: number, customer = "UNKNOWN SENDER"): FeedEvent {
  return { id: "tx1", tenantId: "ten_test", invoiceId: null, customer, amount, narration, outcome: "quarantine", time: "" };
}

const BOOK = [
  inv("INV-1044", "Konga Online", 75500),
  inv("INV-1050", "MTN Nigeria", 1250000),
  inv("INV-1051", "Dangote Cement Plc", 450000, 200000, "partial"),
];

test("narration mentioning the invoice number wins with high confidence", () => {
  const s = bestMatch(ev('"Pymt for inv 1050"', 50000), BOOK);
  assert.equal(s?.invoiceId, "INV-1050");
  assert.equal(s?.confidence, "high");
});

test("exact amount match is suggested even with no narration hint", () => {
  const s = bestMatch(ev("transfer", 75500), BOOK);
  assert.equal(s?.invoiceId, "INV-1044");
  assert.ok(s!.reasons.some((r) => r.includes("total")));
});

test("outstanding-balance match is recognised", () => {
  // INV-1051 balance = 450000 - 200000 = 250000
  const s = bestMatch(ev("balance", 250000), BOOK);
  assert.equal(s?.invoiceId, "INV-1051");
  assert.ok(s!.reasons.some((r) => r.includes("balance")));
});

test("sender name overlap contributes to the score", () => {
  const s = bestMatch(ev("transfer received", 12345, "Konga Online Ltd"), BOOK);
  assert.equal(s?.invoiceId, "INV-1044");
  assert.ok(s!.reasons.some((r) => r.toLowerCase().includes("sender name")));
});

test("stop-words don't create false name matches", () => {
  // "Nigeria"/"Plc" are stop-words; a generic narration must not match MTN Nigeria or Dangote ...Plc
  const s = bestMatch(ev("Nigeria Plc payment", 999), BOOK);
  assert.equal(s, null);
});

test("number too short / no signal yields no suggestion", () => {
  assert.equal(bestMatch(ev("payment 12", 17), BOOK), null);
});

test("combined signals beat single signals (ranking)", () => {
  const list = suggestMatches(ev('"inv 1050 from MTN"', 1250000), BOOK, 3);
  assert.equal(list[0].invoiceId, "INV-1050");
  assert.equal(list[0].confidence, "high");
  // narration(60) + amount(30) + name(MTN) => capped at 100
  assert.equal(list[0].score, 100);
});

test("fully paid invoices are excluded as targets", () => {
  const paidBook = [inv("INV-2000", "Acme", 5000, 5000, "paid")];
  assert.equal(bestMatch(ev("inv 2000", 5000), paidBook), null);
});

test("scoreInvoice is pure and explainable", () => {
  const s = scoreInvoice(ev('"inv 1044"', 75500), BOOK[0]);
  assert.ok(s.score >= 60);
  assert.ok(Array.isArray(s.reasons) && s.reasons.length >= 1);
});

test("aiResolve trusts a valid AI pick and surfaces its reasoning", async () => {
  const chat = mockChat({ invoiceId: "INV-1050", confidence: "high", reasoning: "Narration names invoice 1050." });
  const s = await aiResolve(ev("transfer, no ref", 50000), BOOK, chat);
  assert.equal(s?.invoiceId, "INV-1050");
  assert.equal(s?.source, "ai");
  assert.match(s!.aiReasoning ?? "", /1050/);
});

test("aiResolve falls back to the heuristic when AI returns null (no key / failure)", async () => {
  const chat = mockChat(null);
  const s = await aiResolve(ev('"Pymt for inv 1050"', 50000), BOOK, chat);
  assert.equal(s?.invoiceId, "INV-1050"); // deterministic narration match still wins
  assert.equal(s?.source, "heuristic");
});

test("aiResolve rejects a hallucinated invoice id and falls back", async () => {
  const chat = mockChat({ invoiceId: "INV-9999", confidence: "high", reasoning: "made up" });
  const s = await aiResolve(ev("transfer", 75500), BOOK, chat); // amount matches INV-1044
  assert.equal(s?.invoiceId, "INV-1044");
  assert.equal(s?.source, "heuristic");
});

test("aiResolve never moves money — it only returns a suggestion or null", async () => {
  const chat = mockChat({ invoiceId: null });
  const s = await aiResolve(ev("nothing matches here", 7), BOOK, chat);
  // null AI + no heuristic signal => null suggestion (operator sees nothing to accept)
  assert.equal(s, null);
});
