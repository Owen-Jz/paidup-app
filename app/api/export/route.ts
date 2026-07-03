import { NextRequest } from "next/server";
import { listInvoices, getTenantInvoice } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { ledgerCsv, statementCsv, safeFilenamePart } from "@/lib/export";

export const dynamic = "force-dynamic";

// Audit-grade CSV export (GAPS — customer-level reporting clarity).
//   /api/export                 -> full reconciliation ledger (one row per invoice)
//   /api/export?invoice=INV-x   -> per-invoice statement (one row per payment + running total)
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  const id = req.nextUrl.searchParams.get("invoice");

  let csv: string;
  let filename: string;
  if (id) {
    const inv = getTenantInvoice(id, session.tid); // another tenant's statement reads as 404
    if (!inv) return new Response("invoice not found", { status: 404 });
    csv = statementCsv(inv);
    filename = `paidup-statement-${safeFilenamePart(inv.id)}.csv`;
  } else {
    csv = ledgerCsv(listInvoices(session.tid));
    filename = `paidup-reconciliation-ledger.csv`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
