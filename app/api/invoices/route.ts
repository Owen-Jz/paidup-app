import { NextRequest, NextResponse } from "next/server";
import { createInvoice, listInvoices } from "@/lib/store";
import { createVirtualAccount, nombaConfigured } from "@/lib/nomba";
import { parseJsonBody, reqString, optString, posAmount } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ invoices: listInvoices() });
}

export async function POST(req: NextRequest) {
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

  const ref = `INV-${Date.now().toString().slice(-6)}`;

  // Try to mint a REAL sandbox virtual account; fall back to a mock NUBAN if Nomba is
  // unconfigured or the sandbox 2-VA cap is hit, so the demo never breaks. Pass useNomba:false to force mock.
  let va = {
    acctNumber: String(3000000000 + Math.floor(Math.random() * 999999999)).slice(0, 10),
    acctName: `${customer.split(" ")[0]}/PaidUp`,
    bankName: "Nombank MFB",
  };
  let live = false;

  if (useNomba && nombaConfigured()) {
    try {
      const created = await createVirtualAccount({ accountRef: ref, accountName: customer });
      va = { acctNumber: created.acctNumber, acctName: created.acctName, bankName: created.bankName };
      live = true;
    } catch {
      /* sandbox cap / network — fall back to mock NUBAN */
    }
  }

  const invoice = createInvoice({
    ref, customer, description: description || "Invoice", amount,
    acctNumber: va.acctNumber, acctName: va.acctName, bankName: va.bankName,
  });
  return NextResponse.json({ invoice, live }, { status: 201 });
}
