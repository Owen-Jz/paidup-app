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
  let live = false;

  if (nombaConfigured() && lastPayment?.senderAccountNumber && lastPayment?.senderBankCode) {
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
    } catch {
      /* fall back to recorded demo refund */
    }
  }

  const result = markRefunded(invoiceId);
  if (!result) return NextResponse.json({ error: "could not refund" }, { status: 500 });
  return NextResponse.json({ ok: true, refunded: result.refunded, live });
}
