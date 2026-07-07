import { NextRequest, NextResponse } from "next/server";
import { verifyNombaSignature, isTimestampFresh } from "@/lib/verify";
import { applyPayment, reversePayment } from "@/lib/store";
import { isValidAmount } from "@/lib/reconcile";
import { parseJsonBody } from "@/lib/validate";
import type { NombaPaymentWebhook } from "@/lib/types";

export const dynamic = "force-dynamic";

// Nomba payment webhook receiver.
// 1) cap + parse body  2) verify HMAC + timestamp freshness  3) validate payload
// 4) dedupe on transactionId  5) match by aliasAccountReference  6) reconcile. Returns 2xx fast.
export async function POST(req: NextRequest) {
  const parsed = parseJsonBody<NombaPaymentWebhook>(await req.text());
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const body = parsed.data;

  const secret = process.env.NOMBA_WEBHOOK_SECRET || "";
  const allowUnsigned = process.env.ALLOW_UNSIGNED_WEBHOOKS === "1";
  const sig = req.headers.get("nomba-signature");
  const ts = req.headers.get("nomba-timestamp");

  if (secret) {
    if (!isTimestampFresh(ts)) {
      return NextResponse.json({ ok: false, error: "stale or missing timestamp" }, { status: 401 });
    }
    if (!verifyNombaSignature(body, sig, secret, ts)) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production" && !allowUnsigned) {
    // Fail CLOSED: never accept unsigned webhooks in production unless explicitly opted in.
    return NextResponse.json({ ok: false, error: "webhook secret not configured" }, { status: 503 });
  }

  const t = body.data?.transaction ?? {};

  // Reversal / clawback: money that was credited is being pulled back -> un-reconcile the invoice.
  if (body.event_type === "payment_reversal") {
    if (!t.transactionId) {
      return NextResponse.json({ ok: false, error: "missing transactionId" }, { status: 400 });
    }
    try {
      const result = await reversePayment(t.transactionId, t.time);
      return NextResponse.json({ ok: true, outcome: result.outcome, invoiceId: result.invoiceId });
    } catch (e) {
      console.error("[webhook] reversal failed:", e); // detail stays server-side
      return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
    }
  }

  if (body.event_type !== "payment_success") {
    return NextResponse.json({ ok: true, ignored: body.event_type });
  }

  const c = body.data?.customer ?? {};
  // UNIT: transactionAmount is NAIRA (major units), not kobo — verified against NOMBA-API-REFERENCE.md
  // (docs show decimals like 5000.00 and "up to ₦150"). Invoice amounts are entered in naira too, so
  // classify() compares like-for-like. If a live sandbox webhook ever shows a 100x figure, THAT is the
  // signal the unit is kobo — do the integer-kobo refactor (GAPS #21) before trusting live numbers.
  const amount = Number(t.transactionAmount);
  if (!t.transactionId || !isValidAmount(amount)) {
    return NextResponse.json({ ok: false, error: "missing transactionId or invalid amount" }, { status: 400 });
  }

  try {
    const result = await applyPayment({
      transactionId: t.transactionId,
      aliasAccountReference: t.aliasAccountReference ?? null,
      amount,
      sender: c.senderName ?? "Unknown",
      senderAccountNumber: c.accountNumber,
      senderBankCode: c.bankCode,
      bankName: c.bankName,
      narration: t.narration,
      time: t.time,
      sessionId: t.sessionId,
    });
    return NextResponse.json({ ok: true, outcome: result.outcome, invoiceId: result.invoiceId });
  } catch (e) {
    // Don't poison dedupe: return non-2xx so Nomba retries. Detail is logged, not returned.
    console.error("[webhook] applyPayment failed:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
