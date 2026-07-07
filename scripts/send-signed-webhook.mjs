// Sends a correctly-SIGNED Nomba payment_success webhook to a running PaidUp instance.
// Proves the real HMAC → verify → match-by-aliasAccountReference → reconcile loop end to end,
// with no bank transfer required. Mirrors lib/verify.ts buildSigningString exactly (9 fields).
//
// Usage:
//   NOMBA_WEBHOOK_SECRET=<your Nomba webhook signing key> node scripts/send-signed-webhook.mjs [url] [invoiceRef] [amount] [narration] [senderName]
// Defaults: url=http://localhost:3100/api/webhook  ref=INV-1044  amount=75500 (exact → paid)
// A ref that matches no invoice lands in quarantine — set narration/sender to stage a realistic
// unmatched payment for the AI-resolver demo (e.g. "Pymt for inv 1050" "ACME STORES").
import crypto from "node:crypto";

const url = process.argv[2] || "http://localhost:3100/api/webhook";
const ref = process.argv[3] || "INV-1044";
const amount = Number(process.argv[4] || 75500);
const narration = process.argv[5] || "Signed test transfer";
const senderName = process.argv[6] || "Test Payer";
const secret = process.env.NOMBA_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set NOMBA_WEBHOOK_SECRET (your Nomba webhook signing key) before running.");
  process.exit(1);
}

const now = new Date().toISOString();
const ts = now; // the nomba-timestamp header — bound into the signature, checked for freshness
const body = {
  event_type: "payment_success",
  requestId: crypto.randomUUID(),
  data: {
    merchant: { userId: "test-user", walletId: "test-wallet" },
    transaction: {
      transactionId: `TEST-${Date.now()}`,
      type: "vact_transfer",
      time: now,
      responseCode: "",
      transactionAmount: amount,        // NAIRA (major units) — see webhook route
      aliasAccountReference: ref,       // ⭐ the match key
      narration,
    },
    customer: { senderName, accountNumber: "0123456789", bankCode: "058", bankName: "GTBank" },
  },
};

// 9-field colon-joined signing string (identical order to lib/verify.ts buildSigningString).
const signingString = [
  body.event_type,
  body.requestId,
  body.data.merchant.userId,
  body.data.merchant.walletId,
  body.data.transaction.transactionId,
  body.data.transaction.type,
  body.data.transaction.time,
  body.data.transaction.responseCode,
  ts,
].join(":");
const signature = crypto.createHmac("sha256", secret).update(signingString).digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "nomba-signature": signature, "nomba-timestamp": ts },
  body: JSON.stringify(body),
});
console.log(`HTTP ${res.status}`, await res.text());
