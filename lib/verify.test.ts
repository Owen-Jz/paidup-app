import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignature, verifyNombaSignature, isTimestampFresh } from "./verify.ts";

// Known vector from the Nomba docs (NOMBA-API-REFERENCE.md / docs HMAC samples).
const SECRET = "HkatexKDZg7CLWy96q5sfrVHSvtoz92B";
const TS = "2025-09-29T10:51:44Z";
const EXPECTED = "Kt9095hQxfgmVbx6iz7G2tPhHdbdXgLlyY/mf35sptw=";
const BODY = {
  event_type: "payment_success",
  requestId: "45f2dc2d-d559-4773-bba3-2d5ec17b2e20",
  data: {
    merchant: { userId: "b7b10e81-e57d-41d0-8fdc-f4e23a132bbf", walletId: "6756ff80aafe04a795f18b38" },
    transaction: {
      transactionId: "API-VACT_TRA-B7B10-0435b274-807a-4bc7-8abe-9dbb4548fd7a",
      type: "vact_transfer",
      time: "2025-09-29T10:51:44Z",
      responseCode: "",
    },
  },
};

test("computeSignature matches the Nomba docs vector exactly", () => {
  assert.equal(computeSignature(BODY, SECRET, TS), EXPECTED);
});

test("verifyNombaSignature accepts the correct signature (case-insensitive)", () => {
  assert.equal(verifyNombaSignature(BODY, EXPECTED, SECRET, TS), true);
  assert.equal(verifyNombaSignature(BODY, EXPECTED.toLowerCase(), SECRET, TS), true);
});

test("verifyNombaSignature rejects a forged/wrong signature", () => {
  assert.equal(verifyNombaSignature(BODY, "AAAA0000bbbb1111cccc2222dddd3333eeee4444ffff=", SECRET, TS), false);
  assert.equal(verifyNombaSignature(BODY, null, SECRET, TS), false);
});

test("verifyNombaSignature rejects tampering of a SIGNED field (transactionId)", () => {
  const tampered = JSON.parse(JSON.stringify(BODY));
  tampered.data.transaction.transactionId = "API-VACT_TRA-FORGED";
  assert.equal(verifyNombaSignature(tampered, EXPECTED, SECRET, TS), false);
});

// HONESTY: Nomba's signature covers only 9 fields (see verify.ts). transactionAmount and
// aliasAccountReference — the amount and the invoice a payment maps to — are NOT among them, so
// tampering them does NOT invalidate the signature. This test documents that real limitation; it is
// why the ledger cross-checks credits against Nomba via the requery/sync backstop rather than
// trusting the webhook body alone. (Do not "fix" this by asserting false — that would be a lie.)
test("signature does NOT cover transactionAmount / aliasAccountReference (documented gap)", () => {
  const withMoneyFields = JSON.parse(JSON.stringify(BODY));
  withMoneyFields.data.transaction.transactionAmount = 999999;
  withMoneyFields.data.transaction.aliasAccountReference = "INV-FORGED";
  // Still validates, because those fields are outside the signed set.
  assert.equal(verifyNombaSignature(withMoneyFields, EXPECTED, SECRET, TS), true);
});

test("responseCode 'null' is normalised to empty before signing", () => {
  const withNull = JSON.parse(JSON.stringify(BODY));
  withNull.data.transaction.responseCode = "null";
  assert.equal(computeSignature(withNull, SECRET, TS), EXPECTED);
});

test("isTimestampFresh windows correctly", () => {
  const now = Date.parse("2025-09-29T10:51:44Z");
  assert.equal(isTimestampFresh("2025-09-29T10:50:00Z", 5 * 60_000, now), true);
  assert.equal(isTimestampFresh("2025-09-29T10:00:00Z", 5 * 60_000, now), false);
  assert.equal(isTimestampFresh(null, 5 * 60_000, now), false);
  assert.equal(isTimestampFresh("not-a-date", 5 * 60_000, now), false);
});

// --- S5 webhook hardening regressions ---------------------------------------

test("signature is bound to the timestamp — replay under a new nomba-timestamp fails", () => {
  // An attacker who captures a valid (body, signature) pair can't replay it with a fresh timestamp
  // to slip past the freshness window: the timestamp is part of the signed string.
  assert.equal(verifyNombaSignature(BODY, EXPECTED, SECRET, "2026-01-01T00:00:00Z"), false);
});

test("every signed field is tamper-evident", () => {
  const fields: Array<(b: typeof BODY) => void> = [
    (b) => (b.event_type = "payout_success"),
    (b) => (b.requestId = "forged-request-id"),
    (b) => (b.data.merchant.userId = "attacker"),
    (b) => (b.data.merchant.walletId = "attacker-wallet"),
    (b) => (b.data.transaction.type = "vact_credit"),
    (b) => (b.data.transaction.time = "2025-09-29T10:51:45Z"),
  ];
  for (const mutate of fields) {
    const tampered = JSON.parse(JSON.stringify(BODY));
    mutate(tampered);
    assert.equal(verifyNombaSignature(tampered, EXPECTED, SECRET, TS), false);
  }
});

test("signature confusion — a signature valid for another message does not validate this one", () => {
  const other = JSON.parse(JSON.stringify(BODY));
  other.data.transaction.transactionId = "API-VACT_TRA-OTHER";
  const sigForOther = computeSignature(other, SECRET, TS);
  // sigForOther is a perfectly valid signature... for `other`, not for BODY.
  assert.equal(verifyNombaSignature(BODY, sigForOther, SECRET, TS), false);
  assert.equal(verifyNombaSignature(other, sigForOther, SECRET, TS), true);
});

test("wrong secret never validates (HMAC-bypass guard)", () => {
  assert.equal(verifyNombaSignature(BODY, EXPECTED, "not-the-secret", TS), false);
});

test("a length-mismatched signature is rejected without throwing", () => {
  assert.equal(verifyNombaSignature(BODY, "tooshort", SECRET, TS), false);
});
