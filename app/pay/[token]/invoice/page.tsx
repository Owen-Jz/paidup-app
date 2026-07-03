import type { Metadata } from "next";
import Link from "next/link";
import { getInvoiceByToken } from "@/lib/store";
import { NGN } from "@/lib/format";
import { PrintButton } from "../receipt/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice — PaidUp", robots: { index: false, follow: false } };

// The sendable invoice document. Public via the same unguessable pay token as the payment page —
// the merchant downloads it (Print / Save as PDF) or just sends the link. Unlike the receipt (which
// proves what was PAID), this is the bill: what's owed and exactly how to pay it (the invoice's own
// dedicated virtual account — the account number IS the reference).
export default function InvoiceDocPage({ params }: { params: { token: string } }) {
  const inv = getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard"><div className="empty-state" style={{ padding: "36px 8px" }}>
          <span className="ico">🔗</span><b>Invoice not found</b>
          <span>This link is invalid or expired. Ask the business to resend it.</span>
        </div></div>
      </main>
    );
  }

  const balance = Math.max(Math.round((inv.amount - inv.paid) * 100) / 100, 0);
  const settled = balance <= 0;

  return (
    <main className="receipt-page">
      <div className="receipt-doc">
        <div className="rcpt-top">
          <div className="pay-brand"><span className="mark">P</span> {inv.acctName.split("/")[0]}</div>
          <div className="rcpt-meta">
            <div><span>Invoice</span><b className="mono">{inv.id}</b></div>
            <div><span>Issued</span><b className="mono">{new Date(inv.createdAt).toLocaleDateString()}</b></div>
          </div>
        </div>

        <h1 className="rcpt-h1">Invoice</h1>
        <div className="rcpt-parties">
          <div><span>Billed to</span><b>{inv.customer}</b></div>
          <div><span>For</span><b>{inv.description}</b></div>
        </div>

        <table className="rcpt-table">
          <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td>{inv.description || "Services rendered"}</td>
              <td className="r mono">{NGN(inv.amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="rcpt-totals">
          <div><span>Invoice total</span><b className="mono">{NGN(inv.amount)}</b></div>
          {inv.paid > 0 && <div><span>Received so far</span><b className="mono">{NGN(Math.min(inv.paid, inv.amount))}</b></div>}
          <div className="grand"><span>{settled ? "Status" : "Amount due"}</span>
            <b className="mono">{settled ? "Paid in full" : NGN(balance)}</b></div>
        </div>

        <div className="rcpt-acct">
          <span>How to pay — transfer from any Nigerian bank to this invoice&apos;s dedicated account</span>
          <b className="mono" style={{ fontSize: 20 }}>{inv.acctNumber}</b> · {inv.acctName} · {inv.bankName}
          <p style={{ margin: "8px 0 0", fontSize: 12 }}>
            No reference or narration needed — this account number belongs to invoice {inv.id} alone,
            so your payment reconciles automatically the moment it lands.
          </p>
        </div>

        <div className="rcpt-verify">
          <span>Pay online</span>
          <code>{`/pay/${inv.payToken}`}</code>
          <p>Open the payment page for a scannable QR and live payment status.</p>
        </div>

        <div className="rcpt-actions print-hide">
          <PrintButton />
          <Link className="ghost" href={`/pay/${inv.payToken}`}>Payment page →</Link>
        </div>
      </div>
    </main>
  );
}
