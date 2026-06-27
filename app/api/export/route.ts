import { NextRequest } from "next/server";
import { listInvoices, getInvoice } from "@/lib/store";
import { ledgerCsv, statementCsv, safeFilenamePart } from "@/lib/export";

export const dynamic = "force-dynamic";

// Audit-grade CSV export (GAPS — customer-level reporting clarity).
//   /api/export                 -> full reconciliation ledger (one row per invoice)
//   /api/export?invoice=INV-x   -> per-invoice statement (one row per payment + running total)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("invoice");

  let csv: string;
  let filename: string;
  if (id) {
    const inv = getInvoice(id);
    if (!inv) return new Response("invoice not found", { status: 404 });
    csv = statementCsv(inv);
    filename = `paidup-statement-${safeFilenamePart(inv.id)}.csv`;
  } else {
    csv = ledgerCsv(listInvoices());
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
