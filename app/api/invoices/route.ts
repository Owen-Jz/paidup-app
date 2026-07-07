import { NextRequest, NextResponse } from "next/server";
import { createInvoice, deleteInvoice, getTenantInvoice, listInvoices, nextInvoiceRef } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { createVirtualAccount, deleteVirtualAccount, nombaConfigured } from "@/lib/nomba";
import { parseJsonBody, reqString, optString, posAmount } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ invoices: await listInvoices(session.tid) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { customer?: unknown; description?: unknown; amount?: unknown; items?: unknown; useNomba?: unknown; dueDate?: unknown };

  const customerR = reqString(body.customer, "customer", 120);
  if (!customerR.ok) return NextResponse.json({ error: customerR.error }, { status: 400 });
  const customer = customerR.value;
  const useNomba = body.useNomba !== false;

  // Optional due date: accept an ISO date string; reject anything unparseable. Default handled in store.
  let dueDate: string | undefined;
  if (body.dueDate != null && body.dueDate !== "") {
    if (typeof body.dueDate !== "string" || Number.isNaN(Date.parse(body.dueDate))) {
      return NextResponse.json({ error: "dueDate must be a valid date" }, { status: 400 });
    }
    dueDate = new Date(body.dueDate).toISOString();
  }

  // Two ways to price an invoice:
  //  • itemised — `items: [{description, amount}]` → the total is the (kobo-safe) SUM of the lines,
  //    and the lines are stored for the invoice document. `amount` stays the authoritative total.
  //  • simple — a single `amount` (+ optional description). Unchanged legacy path (onboarding uses it).
  let amount: number;
  let description: string;
  let lineItems: Array<{ description: string; amount: number }> | undefined;

  if (Array.isArray(body.items) && body.items.length > 0) {
    if (body.items.length > 50) return NextResponse.json({ error: "too many line items (max 50)" }, { status: 400 });
    const items: Array<{ description: string; amount: number }> = [];
    let total = 0;
    for (let i = 0; i < body.items.length; i++) {
      const raw = body.items[i] as { description?: unknown; amount?: unknown };
      const dR = reqString(raw?.description, `items[${i}].description`, 140);
      if (!dR.ok) return NextResponse.json({ error: dR.error }, { status: 400 });
      const aR = posAmount(raw?.amount);
      if (!aR.ok) return NextResponse.json({ error: `line ${i + 1}: ${aR.error}` }, { status: 400 });
      items.push({ description: dR.value, amount: aR.value });
      total = Math.round((total + aR.value) * 100) / 100; // kobo-safe running sum
    }
    if (total <= 0) return NextResponse.json({ error: "invoice total must be positive" }, { status: 400 });
    lineItems = items;
    amount = total;
    description = items.map((it) => it.description).join("\n"); // summary = the items
  } else {
    const amountR = posAmount(body.amount);
    if (!amountR.ok) return NextResponse.json({ error: amountR.error }, { status: 400 });
    const descR = optString(body.description, "description", 500);
    if (!descR.ok) return NextResponse.json({ error: descR.error }, { status: 400 });
    amount = amountR.value;
    description = descR.value;
  }

  const ref = await nextInvoiceRef();

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

  const invoice = await createInvoice({
    tenantId: session.tid, ref, customer, description: description || "Invoice", amount, lineItems,
    acctNumber: va.acctNumber, acctName: va.acctName, bankName: va.bankName, vaLive: live, dueDate,
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

  // Capture the record before deletion so we know whether it carried a real Nomba VA.
  const inv = await getTenantInvoice(idR.value, session.tid);
  const r = await deleteInvoice(idR.value, session.tid);
  if (!r.ok) {
    if (r.reason === "has_payments") {
      return NextResponse.json({ error: "this invoice has received money — it can't be deleted, only reconciled" }, { status: 409 });
    }
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }

  // Best-effort: expire the real Nomba-side VA so the NUBAN dies with the reference (the payer's
  // bank then rejects it at name-enquiry). Failure is non-fatal — a live but orphaned VA only ever
  // routes money into quarantine, never loses it.
  let vaExpired = false;
  if (inv?.vaLive && nombaConfigured()) {
    try { vaExpired = await deleteVirtualAccount(inv.id); } catch { /* orphaned VA quarantines, never loses money */ }
  }
  return NextResponse.json({ ok: true, vaExpired });
}
