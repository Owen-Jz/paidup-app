import { NextRequest } from "next/server";
import { getAudit, verifyAudit } from "@/lib/store";
import { toCsv } from "@/lib/export";

export const dynamic = "force-dynamic";

// Tamper-evident audit trail (M3). Operator-only (gated by middleware). Returns the append-only,
// hash-chained log plus an integrity verdict; ?format=csv downloads it for an external auditor.
export async function GET(req: NextRequest) {
  const entries = getAudit();
  const v = verifyAudit();

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const rows: Array<Array<string | number>> = [["Seq", "Time", "Type", "Detail", "PrevHash", "Hash"]];
    for (const e of entries) rows.push([e.seq, e.time, e.type, e.detail, e.prevHash, e.hash]);
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="paidup-audit-trail.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json({ count: entries.length, verified: v.ok, brokenAt: v.brokenAt, entries });
}
