import { NextRequest, NextResponse } from "next/server";
import { applyPayment, getTenantInvoice, reversePayment } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { parseJsonBody, posAmount } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Demo driver: synthesizes a payment_success and runs it through the real reconcile path.
// Lets you show the live-reconcile moment without waiting on a real bank transfer.
const BANKS = ["GTBank", "Opay", "Kuda", "Access Bank", "Zenith Bank", "Moniepoint"];

export async function POST(req: NextRequest) {
  // Forges a payment straight into the ledger — must never be live in production unless DEMO_MODE.
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { invoiceRef?: unknown; amount?: unknown; type?: unknown };
  const invoiceRef = typeof body.invoiceRef === "string" ? body.invoiceRef.slice(0, 80) : null;
  const type = typeof body.type === "string" ? body.type : undefined;

  // Demo a clawback: reverse the most recent payment on the chosen invoice.
  if (type === "reversal") {
    const inv = invoiceRef ? getTenantInvoice(invoiceRef, session.tid) : undefined;
    const last = inv?.payments.filter((p) => p.outcome !== "reversed").slice(-1)[0];
    if (!inv || !last) return NextResponse.json({ error: "no reversible payment on that invoice" }, { status: 400 });
    return NextResponse.json(reversePayment(last.transactionId));
  }

  const amountR = posAmount(body.amount);
  if (!amountR.ok) return NextResponse.json({ error: amountR.error }, { status: 400 });
  const amount = amountR.value;

  // Only this tenant's invoices can be targeted; a foreign ref just quarantines in THIS workspace.
  const ref = invoiceRef && invoiceRef !== "__none" ? invoiceRef : null;
  const inv = ref ? getTenantInvoice(ref, session.tid) : undefined;
  const sender = inv ? inv.customer : "UNKNOWN SENDER";
  const bankName = BANKS[Math.floor(amount) % BANKS.length];

  const result = applyPayment({
    transactionId: `tx_sim_${Date.now()}`,
    // Only a ref the CALLER owns is allowed to match; anything else quarantines in their workspace
    // (a simulated payment must never be able to credit another tenant's invoice).
    aliasAccountReference: inv ? ref : null,
    amount,
    sender,
    senderAccountNumber: "8" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"),
    senderBankCode: "305",
    bankName,
    narration: ref ? `Transfer from ${sender}` : '"Payment, no invoice ref"',
    fallbackTenantId: session.tid,
  });

  return NextResponse.json(result);
}
