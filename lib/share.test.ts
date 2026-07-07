import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappShareUrl, payMessage, reminderMessage } from "./share.ts";

test("whatsappShareUrl builds a wa.me link with url-encoded text", () => {
  const u = whatsappShareUrl("Pay ₦100 now");
  assert.ok(u.startsWith("https://wa.me/?text="));
  assert.ok(u.includes(encodeURIComponent("Pay ₦100 now")));
});

test("payMessage names the customer, invoice, amount and pay link", () => {
  const m = payMessage({ customer: "Dangote", id: "INV-1042", amount: 450000, url: "https://paidup.site/pay/tok_x" });
  assert.ok(m.includes("Dangote"));
  assert.ok(m.includes("INV-1042"));
  assert.ok(m.includes("₦450,000"));
  assert.ok(m.includes("https://paidup.site/pay/tok_x"));
});

test("reminderMessage says overdue when overdueDays > 0, and includes the balance", () => {
  const overdue = reminderMessage({ customer: "Jumia", id: "INV-1043", balance: 50000, url: "u", overdueDays: 3 });
  assert.ok(overdue.toLowerCase().includes("overdue"));
  assert.ok(overdue.includes("3"));
  assert.ok(overdue.includes("₦50,000"));
  const notYet = reminderMessage({ customer: "Jumia", id: "INV-1043", balance: 50000, url: "u", overdueDays: 0 });
  assert.ok(!notYet.toLowerCase().includes("overdue"));
});
