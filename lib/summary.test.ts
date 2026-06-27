import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot, templatedSummary, aiSummary } from "./summary.ts";
import type { Invoice, FeedEvent } from "./types.ts";

function inv(id: string, amount: number, paid: number, status: Invoice["status"]): Invoice {
  return { id, customer: id + " Co", description: "", amount, paid, status, createdAt: "",
    acctNumber: "1", acctName: "x", bankName: "y", payments: [] };
}
function q(): FeedEvent {
  return { id: "q" + Math.random(), invoiceId: null, customer: "UNKNOWN", amount: 5000, outcome: "quarantine", time: "" };
}

const BOOK = [
  inv("INV-1", 100000, 100000, "paid"),
  inv("INV-2", 200000, 50000, "partial"),
  inv("INV-3", 80000, 0, "awaiting"),
  inv("INV-4", 100000, 130000, "overpaid"),
];

test("snapshot rolls up totals and status counts correctly", () => {
  const s = snapshot(BOOK, [q(), q()]);
  assert.equal(s.count, 4);
  assert.equal(s.invoiced, 480000);
  // collected = min(paid,amount) summed + overpaid surplus = (100000+50000+0+100000) + 30000 = 280000
  assert.equal(s.collected, 280000);
  // outstanding = 0 + 150000 + 80000 + 0 = 230000
  assert.equal(s.outstanding, 230000);
  assert.equal(s.paid, 1);
  assert.equal(s.partial, 1);
  assert.equal(s.awaiting, 1);
  assert.equal(s.overpaid, 1);
  assert.equal(s.unmatched, 2);
  assert.equal(s.collectionRate, Math.round((280000 / 480000) * 100));
});

test("top outstanding is ranked by balance, capped at 3", () => {
  const s = snapshot(BOOK, []);
  assert.equal(s.topOutstanding[0].id, "INV-2"); // 150000 balance is biggest
  assert.ok(s.topOutstanding.length <= 3);
});

test("templatedSummary always produces grounded prose with the real figures", () => {
  const s = snapshot(BOOK, [q()]);
  const t = templatedSummary(s);
  assert.match(t, /₦280,000/);   // collected
  assert.match(t, /₦480,000/);   // invoiced
  assert.match(t, /unmatched/);  // attention line
});

test("aiSummary returns the AI text when available", async () => {
  const chat = (async () => "Great progress — chase MTN next.") as any;
  const r = await aiSummary(snapshot(BOOK, []), chat);
  assert.equal(r.source, "ai");
  assert.match(r.summary, /MTN/);
});

test("aiSummary falls back to the templated brief when AI returns null", async () => {
  const r = await aiSummary(snapshot(BOOK, []), (async () => null) as any);
  assert.equal(r.source, "template");
  assert.equal(r.summary, templatedSummary(snapshot(BOOK, [])));
});

test("aiSummary falls back when AI returns blank text", async () => {
  const r = await aiSummary(snapshot(BOOK, []), (async () => "   ") as any);
  assert.equal(r.source, "template");
});
