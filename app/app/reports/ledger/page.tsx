import Link from "next/link";
import { listInvoices } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { NGN, STATUS_LABEL } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Printable, branded reconciliation-ledger report (Save as PDF). Tenant-scoped. The raw CSV stays
// available for spreadsheet work; this is the presentable, hand-to-anyone version.
export default async function LedgerReport() {
  const session = await requireSession();
  if (!session) return null;
  const invoices = await listInvoices(session.tid);
  const business = session.tenant.businessName;

  const invoiced = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0)
    + invoices.filter((i) => i.status === "overpaid").reduce((a, i) => a + (i.paid - i.amount), 0);
  const outstanding = invoices.reduce((a, i) => a + Math.max(i.amount - i.paid, 0), 0);
  const rate = invoiced ? Math.round((collected / invoiced) * 100) : 0;

  return (
    <main className="receipt-page">
      <div className="receipt-doc report-doc">
        <div className="rcpt-top">
          <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> {business}</div>
          <div className="rcpt-meta">
            <div><span>Report</span><b className="mono">Reconciliation ledger</b></div>
            <div><span>Generated</span><b className="mono">{new Date().toLocaleString()}</b></div>
          </div>
        </div>

        <h1 className="rcpt-h1">Reconciliation ledger</h1>

        <div className="rcpt-totals" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18, borderTop: "none" }}>
          <div style={{ display: "block" }}><span>Invoiced</span><br /><b className="mono">{NGN(invoiced)}</b></div>
          <div style={{ display: "block" }}><span>Collected</span><br /><b className="mono">{NGN(collected)}</b></div>
          <div style={{ display: "block" }}><span>Outstanding</span><br /><b className="mono">{NGN(outstanding)}</b></div>
          <div style={{ display: "block" }}><span>Collection rate</span><br /><b className="mono">{rate}%</b></div>
        </div>

        <table className="rcpt-table report-table" style={{ marginTop: 18 }}>
          <colgroup>
            <col className="c-inv" /><col className="c-cust" /><col className="c-va" />
            <col className="c-amt" /><col className="c-col" /><col className="c-status" />
          </colgroup>
          <thead>
            <tr>
              <th>Invoice</th><th>Customer</th><th>Virtual account</th>
              <th className="r">Amount</th><th className="r">Collected</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.id}</td>
                <td>{i.customer}</td>
                <td className="mono">{i.acctNumber}<br /><span style={{ color: "var(--faint)", fontSize: 11 }}>{i.bankName}</span></td>
                <td className="r mono">{NGN(i.amount)}</td>
                <td className="r mono">{NGN(Math.min(i.paid, i.amount))}</td>
                <td>{STATUS_LABEL[i.status] ?? i.status}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No invoices yet.</td></tr>}
          </tbody>
        </table>

        <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 14 }}>
          PaidUp — per-invoice reconciliation on Nomba. Figures reflect the live ledger at generation time.
        </p>

        <div className="rcpt-actions print-hide">
          <PrintButton />
          <a className="ghost" href="/api/export" style={{ textDecoration: "none" }}>⤓ Download CSV</a>
          <Link className="ghost" href="/app/invoices" style={{ textDecoration: "none" }}>← Back</Link>
        </div>
      </div>
    </main>
  );
}
