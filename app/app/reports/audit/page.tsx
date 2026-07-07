import Link from "next/link";
import { getAudit, verifyAudit, DEMO_TENANT_ID } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Printable, branded audit-trail report (Save as PDF). Integrity is verified over the FULL global
// hash chain (the tamper-evidence property); each tenant only SEES its own entries.
export default async function AuditReport() {
  const session = await requireSession();
  if (!session) return null;
  const business = session.tenant.businessName;
  const v = await verifyAudit();
  const entries = (await getAudit()).filter(
    (e) => e.tenantId === session.tid || (e.tenantId == null && session.tid === DEMO_TENANT_ID),
  );

  return (
    <main className="receipt-page">
      <div className="receipt-doc report-doc">
        <div className="rcpt-top">
          <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> {business}</div>
          <div className="rcpt-meta">
            <div><span>Report</span><b className="mono">Audit trail</b></div>
            <div><span>Generated</span><b className="mono">{new Date().toLocaleString()}</b></div>
          </div>
        </div>

        <h1 className="rcpt-h1">Audit trail</h1>

        <div className="rcpt-acct" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ margin: 0 }}>Integrity</span>
          <b style={{ color: v.ok ? "var(--paid)" : "var(--attn)", fontSize: 14 }}>
            {v.ok ? "✓ Verified — hash chain intact, no entry altered" : `⚠ Broken at entry ${(v.brokenAt ?? 0) + 1}`}
          </b>
          <span style={{ marginLeft: "auto", color: "var(--faint)", fontSize: 12 }}>{entries.length} entries</span>
        </div>

        <table className="rcpt-table report-table">
          <colgroup>
            <col className="c-seq" /><col className="c-time" /><col className="c-action" />
            <col className="c-detail" /><col className="c-hash" />
          </colgroup>
          <thead>
            <tr><th>#</th><th>Time</th><th>Action</th><th>Detail</th><th>Hash</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.seq}>
                <td className="mono">{e.seq}</td>
                <td className="mono" style={{ fontSize: 11 }}>{new Date(e.time).toLocaleString()}</td>
                <td className="mono">{e.type}</td>
                <td style={{ fontSize: 12 }}>{e.detail}</td>
                <td className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{e.hash.slice(0, 12)}…</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No audit entries yet.</td></tr>}
          </tbody>
        </table>

        <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 14 }}>
          Each entry&apos;s hash chains to the previous one — altering, reordering, or deleting any past
          entry breaks the chain. PaidUp — tamper-evident reconciliation on Nomba.
        </p>

        <div className="rcpt-actions print-hide">
          <PrintButton />
          <a className="ghost" href="/api/audit?format=csv" style={{ textDecoration: "none" }}>⤓ Download CSV</a>
          <Link className="ghost" href="/app/invoices" style={{ textDecoration: "none" }}>← Back</Link>
        </div>
      </div>
    </main>
  );
}
