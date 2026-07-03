import { test } from "node:test";
import assert from "node:assert/strict";
import { scanAnomalies, explainAnomalies } from "./anomaly.ts";
import type { Invoice, FeedEvent, Payment } from "./types.ts";

// Mock MiniMax chat — lets us test the AI explain seam offline (no network/key).
const mockChat = (out: unknown) => (async () => out) as any;

function pay(o: Partial<Payment> & { amount: number; transactionId: string; time: string }): Payment {
  return {
    sender: o.sender ?? "Acme", bankName: "GTBank", outcome: o.outcome ?? "partial",
    senderAccountNumber: o.senderAccountNumber, narration: o.narration, ...o,
  } as Payment;
}
function inv(id: string, amount: number, paid: number, status: Invoice["status"], payments: Payment[] = []): Invoice {
  return { id, tenantId: "ten_test", customer: "Acme Co", description: "", amount, paid, status, createdAt: "",
    acctNumber: "1", acctName: "x", bankName: "y", payments };
}
function q(acct: string, customer = "UNKNOWN"): FeedEvent {
  return { id: "q" + Math.random(), tenantId: "ten_test", invoiceId: null, customer, amount: 5000, outcome: "quarantine", time: "", senderAccountNumber: acct };
}

test("large overpayment (>=150%) is flagged HIGH", () => {
  const a = scanAnomalies([inv("INV-1", 100000, 200000, "overpaid")], []);
  assert.ok(a.some((x) => x.type === "large_overpayment" && x.severity === "high"));
});

test("normal overpayment (<150%) is NOT flagged as large", () => {
  const a = scanAnomalies([inv("INV-1", 100000, 120000, "overpaid")], []);
  assert.ok(!a.some((x) => x.type === "large_overpayment"));
});

test("two identical transfers within 10 min -> possible duplicate (HIGH)", () => {
  const ps = [
    pay({ amount: 50000, transactionId: "txA", time: "2026-06-26T10:00:00Z", senderAccountNumber: "999" }),
    pay({ amount: 50000, transactionId: "txB", time: "2026-06-26T10:05:00Z", senderAccountNumber: "999" }),
  ];
  const a = scanAnomalies([inv("INV-1", 200000, 100000, "partial", ps)], []);
  assert.ok(a.some((x) => x.type === "possible_duplicate" && x.severity === "high"));
});

test("identical transfers far apart are NOT duplicates", () => {
  const ps = [
    pay({ amount: 50000, transactionId: "txA", time: "2026-06-26T10:00:00Z", senderAccountNumber: "999" }),
    pay({ amount: 50000, transactionId: "txB", time: "2026-06-26T14:00:00Z", senderAccountNumber: "999" }),
  ];
  const a = scanAnomalies([inv("INV-1", 200000, 100000, "partial", ps)], []);
  assert.ok(!a.some((x) => x.type === "possible_duplicate"));
});

test("repeated unmatched from one account -> MEDIUM", () => {
  const a = scanAnomalies([], [q("12345678"), q("12345678")]);
  assert.ok(a.some((x) => x.type === "repeat_unmatched" && x.severity === "medium"));
});

test("single unmatched from an account is not flagged", () => {
  const a = scanAnomalies([], [q("12345678")]);
  assert.ok(!a.some((x) => x.type === "repeat_unmatched"));
});

test("one payer settling >=3 invoices -> INFO", () => {
  const mk = (id: string) => inv(id, 1000, 1000, "paid", [pay({ amount: 1000, transactionId: "t" + id, time: "2026-06-26T10:00:00Z", senderAccountNumber: "777" })]);
  const a = scanAnomalies([mk("INV-1"), mk("INV-2"), mk("INV-3")], []);
  assert.ok(a.some((x) => x.type === "multi_invoice_payer" && x.severity === "info"));
});

test("clean ledger yields no anomalies", () => {
  assert.deepEqual(scanAnomalies([inv("INV-1", 100000, 100000, "paid")], []), []);
});

test("results are sorted high -> medium -> info", () => {
  const ps = [
    pay({ amount: 50000, transactionId: "txA", time: "2026-06-26T10:00:00Z", senderAccountNumber: "999" }),
    pay({ amount: 50000, transactionId: "txB", time: "2026-06-26T10:05:00Z", senderAccountNumber: "999" }),
  ];
  const a = scanAnomalies([inv("INV-1", 60000, 100000, "overpaid", ps)], [q("8"), q("8")]);
  const sev = a.map((x) => x.severity);
  const idx = { high: 0, medium: 1, info: 2 } as const;
  for (let i = 1; i < sev.length; i++) assert.ok(idx[sev[i]] >= idx[sev[i - 1]]);
});

test("explainAnomalies attaches AI recommendations aligned by index", async () => {
  const flags = scanAnomalies([inv("INV-1", 100000, 200000, "overpaid")], [q("12345678"), q("12345678")]);
  const chat = mockChat(flags.map((_, i) => ({ index: i, recommendation: `do thing ${i}` })));
  const out = await explainAnomalies(flags, chat);
  assert.equal(out.length, flags.length);
  out.forEach((o, i) => assert.equal(o.recommendation, `do thing ${i}`));
});

test("explainAnomalies falls back cleanly when AI returns null (no key / failure)", async () => {
  const flags = scanAnomalies([inv("INV-1", 100000, 200000, "overpaid")], []);
  const out = await explainAnomalies(flags, mockChat(null));
  assert.equal(out.length, flags.length);
  assert.ok(out.every((o) => o.recommendation === undefined)); // static message still present via o.message
  assert.equal(out[0].message, flags[0].message);
});

test("explainAnomalies on an empty flag list returns empty (no AI call needed)", async () => {
  let called = false;
  const chat = (async () => { called = true; return []; }) as any;
  const out = await explainAnomalies([], chat);
  assert.equal(out.length, 0);
  assert.equal(called, false);
});
