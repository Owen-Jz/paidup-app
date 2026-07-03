import { NextRequest } from "next/server";
import { getAudit, verifyAudit, DEMO_TENANT_ID } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { toCsv } from "@/lib/export";

export const dynamic = "force-dynamic";

// Tamper-evident audit trail (M3). Returns the append-only, hash-chained log plus an integrity
// verdict; ?format=csv downloads it for an external auditor. Integrity is verified over the FULL
// global chain (that's the tamper-evidence property), but each tenant only ever SEES its own
// entries. Pre-tenancy entries (no tenantId) belong to the demo/operator workspace.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const v = verifyAudit();
  const entries = getAudit().filter(
    (e) => e.tenantId === session.tid || (e.tenantId == null && session.tid === DEMO_TENANT_ID),
  );

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
