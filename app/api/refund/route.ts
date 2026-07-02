import { NextRequest, NextResponse } from "next/server";
import { getInvoice, markRefunded } from "@/lib/store";
import { transferToBank, lookupBankAccount, nombaConfigured } from "@/lib/nomba";
import { parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Refund an overpayment surplus back to the payer.
// banks -> lookup (confirm name) -> /v2/transfers/bank, with a STABLE idempotency key.
// Falls back to a recorded demo refund if Nomba isn't configured or the transfer fails.
export async function POST(req: NextRequest) {
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const idR = reqString((parsed.data as { invoiceId?: unknown }).invoiceId, "invoiceId", 40);
  if (!idR.ok) return NextResponse.json({ error: idR.error }, { status: 400 });
  const invoiceId = idR.value;

  const inv = getInvoice(invoiceId);
  if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  if (inv.status !== "overpaid") return NextResponse.json({ error: "invoice is not overpaid" }, { status: 400 });

  const surplus = Math.round((inv.paid - inv.amount) * 100) / 100;
  const lastPayment = inv.payments[inv.payments.length - 1];
  // "demo" mirrors the simulate route: dev, or prod with DEMO_MODE=1. Sandbox refunds are
  // production-only (they return PENDING_BILLING), so a demo records the action without settlement.
  const demo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
  let live = false;

  // The rule: in PRODUCTION we must actually move the money — if we can't identify the payer or the
  // transfer doesn't settle, we must NOT mark the ledger refunded (a phantom "money returned" record
  // is worse than none). In an explicit DEMO (DEMO_MODE=1), sandbox transfers can't settle, so we
  // still exercise the real call path but record the refund as a demo action (live:false) rather
  // than failing — the UI labels it not-settled. With Nomba unconfigured we likewise record a demo refund.
  if (nombaConfigured()) {
    if (lastPayment?.senderAccountNumber && lastPayment?.senderBankCode) {
      try {
        await lookupBankAccount(lastPayment.senderAccountNumber, lastPayment.senderBankCode);
        await transferToBank({
          amount: surplus,
          accountNumber: lastPayment.senderAccountNumber,
          accountName: lastPayment.sender,
          bankCode: lastPayment.senderBankCode,
          narration: `Refund of overpayment on ${invoiceId}`,
          idempotencyKey: `refund_${invoiceId}_${lastPayment.transactionId}`,
        });
        live = true;
      } catch (e) {
        // transferToBank throws unless data.status === SUCCESS — a genuine non-settlement.
        if (!demo) return NextResponse.json({ error: "refund transfer did not settle — ledger unchanged", detail: String((e as Error)?.message ?? e) }, { status: 502 });
      }
    } else if (!demo) {
      return NextResponse.json({ error: "cannot refund: payer bank details unavailable" }, { status: 422 });
    }
  }

  // Reached when: the transfer settled (live), OR this is an explicit demo / unconfigured build.
  const result = markRefunded(invoiceId);
  if (!result) return NextResponse.json({ error: "could not refund" }, { status: 500 });
  return NextResponse.json({ ok: true, refunded: result.refunded, live });
}
