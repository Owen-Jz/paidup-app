import { NextRequest, NextResponse } from "next/server";
import { getEvent, resolveQuarantineToInvoice, markQuarantineBounced } from "@/lib/store";
import { transferToBank, lookupBankAccount, nombaConfigured } from "@/lib/nomba";
import { parseJsonBody, reqString, oneOf } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Resolve an unmatched (quarantined) payment (GAPS #9 — the judged "unmatched handling" sub-bar):
//   action="assign" → re-match it to an invoice and reconcile (idempotent; reuses the existing tx).
//   action="bounce" → send the money back to the payer via /v2/transfers/bank, then mark it bounced.
export async function POST(req: NextRequest) {
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { action?: unknown; transactionId?: unknown; invoiceId?: unknown };

  const actionR = oneOf(body.action, ["assign", "bounce"] as const, "action");
  if (!actionR.ok) return NextResponse.json({ error: actionR.error }, { status: 400 });
  const txR = reqString(body.transactionId, "transactionId", 80);
  if (!txR.ok) return NextResponse.json({ error: txR.error }, { status: 400 });
  const action = actionR.value;
  const transactionId = txR.value;

  if (action === "assign") {
    const invR = reqString(body.invoiceId, "invoiceId", 40);
    if (!invR.ok) return NextResponse.json({ error: invR.error }, { status: 400 });
    const invoiceId = invR.value;
    const result = resolveQuarantineToInvoice(transactionId, invoiceId);
    if (!result) return NextResponse.json({ error: "could not assign (not quarantined / unknown invoice)" }, { status: 400 });
    return NextResponse.json({ ok: true, outcome: result.outcome, invoiceId: result.invoice.id });
  }

  if (action === "bounce") {
    const ev = getEvent(transactionId);
    if (!ev || ev.outcome !== "quarantine") return NextResponse.json({ error: "not a quarantined payment" }, { status: 400 });
    let live = false;
    if (nombaConfigured() && ev.senderAccountNumber && ev.senderBankCode) {
      try {
        await lookupBankAccount(ev.senderAccountNumber, ev.senderBankCode);
        await transferToBank({
          amount: ev.amount,
          accountNumber: ev.senderAccountNumber,
          accountName: ev.customer,
          bankCode: ev.senderBankCode,
          narration: "Returned: no matching invoice",
          idempotencyKey: `bounce_${transactionId}`,
        });
        live = true;
      } catch {
        /* fall back to recorded bounce */
      }
    }
    const ok = markQuarantineBounced(transactionId);
    if (!ok) return NextResponse.json({ error: "could not bounce" }, { status: 500 });
    return NextResponse.json({ ok: true, live });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
