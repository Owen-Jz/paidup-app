import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, ledgerCsv, statementCsv, safeFilenamePart } from "./export.ts";
import type { Invoice, Payment } from "./types.ts";

function pay(amount: number, over: Payment["outcome"] = "partial", narration = ""): Payment {
  return { transactionId: "tx_" + amount, amount, sender: "Acme Co", bankName: "GTBank", time: "2026-06-26T10:00:00Z", outcome: over, narration };
}
function inv(over = false): Invoice {
  return {
    id: "INV-1044", customer: "Konga, Online", description: 'Redesign "phase 1"', amount: 100000,
    paid: over ? 120000 : 60000, status: over ? "overpaid" : "partial", createdAt: "2026-06-26T09:00:00Z",
    acctNumber: "7741120385", acctName: "Konga/PaidUp", bankName: "Nombank MFB",
    payments: [pay(60000), ...(over ? [pay(60000, "overpaid")] : [])],
  };
}

test("toCsv escapes commas, quotes, newlines (RFC-4180)", () => {
  const out = toCsv([["a,b", 'he said "hi"', "line1\nline2"]]);
  assert.equal(out, '"a,b","he said ""hi""","line1\nline2"\r\n');
});

test("ledgerCsv has a header + one row per invoice with tied-out figures", () => {
  const csv = ledgerCsv([inv(false), inv(true)]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 3); // header + 2
  assert.ok(lines[0].startsWith("Invoice,Customer,"));
  // partial invoice: collected 60000, balance 40000, overpaid 0
  assert.ok(lines[1].includes("60000.00") && lines[1].includes("40000.00"));
  // overpaid invoice: collected capped at 100000, overpaid 20000
  assert.ok(lines[2].includes("100000.00") && lines[2].includes("20000.00"));
});

test("statementCsv lists each payment with a running total", () => {
  const csv = statementCsv(inv(true));
  assert.ok(csv.includes("Statement for,INV-1044"));
  // two payments of 60000 -> running totals 60000 then 120000
  assert.ok(csv.includes("60000.00"));
  assert.ok(csv.includes("120000.00"));
});

test("customer name with a comma stays a single CSV field", () => {
  const csv = ledgerCsv([inv(false)]);
  assert.ok(csv.includes('"Konga, Online"'));
});

test("empty payment list still produces a valid statement", () => {
  const i = inv(false); i.payments = []; i.paid = 0; i.status = "awaiting";
  const csv = statementCsv(i);
  assert.ok(csv.includes("Statement for,INV-1044"));
  assert.ok(csv.includes("Balance (NGN),100000.00"));
});

test("CSV formula-injection: malicious customer/description in ledger is neutralized", () => {
  const i = inv(false);
  i.customer = '=HYPERLINK("http://evil","click")';
  i.description = "@SUM(1+1)*cmd";
  i.acctName = "+1234567890";
  const csv = ledgerCsv([i]);
  // every dangerous value is prefixed with a single quote (rendered as text, not a formula)...
  assert.ok(csv.includes(`'=HYPERLINK`), "customer formula not guarded");
  assert.ok(csv.includes(`'@SUM(1+1)*cmd`), "description formula not guarded");
  // ...and NO field is emitted starting with a raw formula trigger (after a delimiter or line start).
  assert.ok(!/(^|[,\r\n])[=+\-@]/.test(csv), "a raw formula-trigger field leaked into the CSV");
});

test("CSV formula-injection: malicious narration in a statement is neutralized", () => {
  const i = inv(true);
  i.payments[0] = { ...i.payments[0], narration: "=cmd|'/c calc'!A1" };
  const csv = statementCsv(i);
  assert.ok(csv.includes(`'=cmd`), "narration formula not guarded");
  assert.ok(!/(^|[,\r\n])[=+\-@]/.test(csv), "a raw formula-trigger field leaked into the CSV");
});

test("safeFilenamePart strips header-injection chars and caps length", () => {
  assert.equal(safeFilenamePart("INV-1044"), "INV-1044"); // legit id untouched
  assert.equal(safeFilenamePart('inv"\r\n.csv"; x=1'), "inv___.csv___x_1"); // quotes/CRLF neutralized
  assert.ok(!/[\r\n"]/.test(safeFilenamePart('a"\r\nb')), "no CR/LF/quote survives");
  assert.equal(safeFilenamePart(""), "export"); // fallback when nothing survives
  assert.equal(safeFilenamePart("x".repeat(200)).length, 64); // length-capped
});

test("formula guard does not touch legitimate numeric/text cells", () => {
  const csv = ledgerCsv([inv(true)]);
  // money values must stay exactly as-is (no stray leading apostrophe) so figures tie out.
  assert.ok(csv.includes("100000.00") && !csv.includes("'100000.00"));
  assert.ok(csv.includes("Konga, Online".length ? '"Konga, Online"' : ""));
});
