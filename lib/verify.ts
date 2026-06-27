// Nomba webhook signature verification — VERIFIED scheme from the docs (2026-06-26).
// NOT HMAC over the raw body. It is HMAC-SHA256 over a fixed 9-field colon-joined string,
// base64-encoded, compared case-insensitively to the `nomba-signature` header.
// Fields: event_type:requestId:userId:walletId:transactionId:type:time:responseCode:nomba-timestamp
//   userId/walletId  <- data.merchant
//   transactionId/type/time/responseCode <- data.transaction  (responseCode "null" => "")
//   nomba-timestamp  <- the request header value (NOT a body field)

import crypto from "crypto";

export interface NombaWebhookBody {
  event_type?: string;
  requestId?: string;
  data?: {
    merchant?: { userId?: string; walletId?: string };
    transaction?: { transactionId?: string; type?: string; time?: string; responseCode?: string };
  };
}

export function buildSigningString(body: NombaWebhookBody, nombaTimestamp: string): string {
  const m = body.data?.merchant ?? {};
  const t = body.data?.transaction ?? {};
  let responseCode = t.responseCode ?? "";
  if (responseCode === "null") responseCode = "";
  return [
    body.event_type ?? "",
    body.requestId ?? "",
    m.userId ?? "",
    m.walletId ?? "",
    t.transactionId ?? "",
    t.type ?? "",
    t.time ?? "",
    responseCode,
    nombaTimestamp,
  ].join(":");
}

export function computeSignature(body: NombaWebhookBody, secret: string, nombaTimestamp: string): string {
  return crypto.createHmac("sha256", secret).update(buildSigningString(body, nombaTimestamp)).digest("base64");
}

/**
 * Reject stale events (replay defense-in-depth on top of transactionId dedupe).
 * nomba-timestamp is RFC-3339; default window ±5 minutes.
 */
export function isTimestampFresh(nombaTimestamp: string | null | undefined, maxSkewMs = 5 * 60_000, now = Date.now()): boolean {
  if (!nombaTimestamp) return false;
  const t = Date.parse(nombaTimestamp);
  if (Number.isNaN(t)) return false;
  return Math.abs(now - t) <= maxSkewMs;
}

/** Constant-time, case-insensitive comparison against the nomba-signature header. */
export function verifyNombaSignature(
  body: NombaWebhookBody,
  signatureHeader: string | null | undefined,
  secret: string,
  nombaTimestamp: string | null | undefined
): boolean {
  if (!signatureHeader || !nombaTimestamp) return false;
  const expected = computeSignature(body, secret, nombaTimestamp).toLowerCase();
  const got = signatureHeader.toLowerCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
