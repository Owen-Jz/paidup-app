import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getInvoiceByToken } from "@/lib/store";
import { NGN } from "@/lib/format";
import { PrintButton } from "../receipt/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice — PaidUp", robots: { index: false, follow: false } };

// The sendable invoice document. Public via the same unguessable pay token as the payment page —
// the merchant downloads it (Print / Save as PDF) or just sends the link. Unlike the receipt (which
// proves what was PAID), this is the bill: what's owed and exactly how to pay it (the invoice's own
// dedicated virtual account — the account number IS the reference).
export default async function InvoiceDocPage({ params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);

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

  // Absolute pay-page URL for the printed document — a customer holding paper can't use a relative path.
  // Derived from the request so it's right on paidup.site, the ngrok URL, and localhost alike.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "paidup.site";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const payUrl = `${proto}://${host}/pay/${inv.payToken}`;

  // Prefer the itemised breakdown (each line priced). Fall back to newline-split descriptions
  // (breakdown lines, single total) for invoices created before line items existed.
  const items = inv.lineItems && inv.lineItems.length
    ? inv.lineItems
    : (inv.description || "Services rendered").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        .map((description, i, arr) => ({ description, amount: i === arr.length - 1 ? inv.amount : null as number | null }));
  const itemised = Boolean(inv.lineItems && inv.lineItems.length);
  const summary = items[0]?.description ?? "Services rendered";

  return (
    <main className="receipt-page">
      <div className="receipt-doc">
        <div className="rcpt-top">
          <div className="pay-brand"><img src="/logo.svg" alt="" width={24} height={24} style={{ borderRadius: 6, verticalAlign: "middle" }} /> {inv.acctName.split("/")[0]}</div>
          <div className="rcpt-meta">
            <div><span>Invoice</span><b className="mono">{inv.id}</b></div>
            <div><span>Issued</span><b className="mono">{new Date(inv.createdAt).toLocaleDateString()}</b></div>
          </div>
        </div>

        <h1 className="rcpt-h1">Invoice</h1>
        <div className="rcpt-parties">
          <div><span>Billed to</span><b>{inv.customer}</b></div>
          <div><span>For</span><b>{itemised ? `${items.length} item${items.length > 1 ? "s" : ""}` : summary}</b></div>
        </div>

        <table className="rcpt-table">
          <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={n}>
                <td>{it.description}</td>
                <td className="r mono">{it.amount != null ? NGN(it.amount) : ""}</td>
              </tr>
            ))}
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
          <code>{payUrl}</code>
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
