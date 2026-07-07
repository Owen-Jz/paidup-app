import { NextResponse } from "next/server";
import { getInvoiceByToken } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public, read-only payment status by pay token — powers the live "Payment received" flip on the pay
// page. Exposes ONLY payer-relevant fields (never the rest of the ledger). Reached by unguessable token.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isPaid = inv.status === "paid" || inv.status === "overpaid" || inv.paid >= inv.amount;
  return NextResponse.json({ status: inv.status, paid: inv.paid, amount: inv.amount, isPaid });
}
