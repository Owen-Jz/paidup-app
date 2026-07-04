import { NextRequest, NextResponse } from "next/server";
import { createInvoice, deleteInvoice, listInvoices, nextInvoiceRef } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { createVirtualAccount, nombaConfigured } from "@/lib/nomba";
import { parseJsonBody, reqString, optString, posAmount } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ invoices: listInvoices(session.tid) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { customer?: unknown; description?: unknown; amount?: unknown; useNomba?: unknown };

  const customerR = reqString(body.customer, "customer", 120);
  if (!customerR.ok) return NextResponse.json({ error: customerR.error }, { status: 400 });
  const amountR = posAmount(body.amount);
  if (!amountR.ok) return NextResponse.json({ error: amountR.error }, { status: 400 });
  const descR = optString(body.description, "description", 280);
  if (!descR.ok) return NextResponse.json({ error: descR.error }, { status: 400 });

  const customer = customerR.value;
  const amount = amountR.value;
  const description = descR.value;
  const useNomba = body.useNomba !== false;

  const ref = nextInvoiceRef();

  // Try to mint a REAL sandbox virtual account; fall back to a mock NUBAN if Nomba is
  // unconfigured or the call fails, so the demo never breaks. Pass useNomba:false to force mock.
  // The VA is held under the TENANT's business name (the beneficiary the payer sees), not the payer's.
  const businessName = session.tenant.businessName;
  let va = {
    acctNumber: String(3000000000 + Math.floor(Math.random() * 999999999)).slice(0, 10),
    acctName: `${businessName}/PaidUp`,
    bankName: "Nombank MFB",
  };
  let live = false;

  if (useNomba && nombaConfigured()) {
    try {
      const created = await createVirtualAccount({ accountRef: ref, accountName: businessName });
      va = { acctNumber: created.acctNumber, acctName: created.acctName, bankName: created.bankName };
      live = true;
    } catch {
      /* sandbox cap / network — fall back to mock NUBAN */
    }
  }

  const invoice = createInvoice({
    tenantId: session.tid, ref, customer, description: description || "Invoice", amount,
    acctNumber: va.acctNumber, acctName: va.acctName, bankName: va.bankName,
  });
  return NextResponse.json({ invoice, live }, { status: 201 });
}

// Delete a clean (never-paid) invoice: /api/invoices?id=INV-x. An invoice with money on record is
// a ledger fact and refuses deletion (409) — the store enforces this, not just the UI.
export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const idR = reqString(req.nextUrl.searchParams.get("id"), "id", 40);
  if (!idR.ok) return NextResponse.json({ error: idR.error }, { status: 400 });

  const r = deleteInvoice(idR.value, session.tid);
  if (!r.ok) {
    if (r.reason === "has_payments") {
      return NextResponse.json({ error: "this invoice has received money — it can't be deleted, only reconciled" }, { status: 409 });
    }
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
