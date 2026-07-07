import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getInvoiceByToken } from "@/lib/store";
import { receiptNumber, receiptHash } from "@/lib/receipt";
import { NGN } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipt — PaidUp", robots: { index: false, follow: false } };

// Branded, print-to-PDF receipt (POLISH M2). Public via the unguessable pay token. Lists the payments
// received against the invoice with a tamper-evident verification code. "Print / Save as PDF" yields a
// clean document (print CSS hides the app chrome). Exposes only payer-relevant fields.
export default async function ReceiptPage({ params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard"><div className="empty-state" style={{ padding: "36px 8px" }}>
          <span className="ico">🔗</span><b>Receipt not found</b>
          <span>This link is invalid or expired. Ask the business to resend it.</span>
        </div></div>
      </main>
    );
  }

  const received = inv.payments.reduce((s, p) => s + (p.outcome === "reversed" ? 0 : p.amount), 0);
  const balance = Math.max(Math.round((inv.amount - inv.paid) * 100) / 100, 0);

  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "paidup.site"}`;
  const verifyUrl = `${origin}/pay/${inv.payToken}/verify`;
  const verifyQr = await qrSvg(verifyUrl);

  return (
    <main className="receipt-page">
      <div className="receipt-doc">
        <div className="rcpt-top">
          <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> PaidUp</div>
          <div className="rcpt-meta">
            <div><span>Receipt</span><b className="mono">{receiptNumber(inv)}</b></div>
            <div><span>Invoice</span><b className="mono">{inv.id}</b></div>
          </div>
        </div>

        <h1 className="rcpt-h1">Payment receipt</h1>
        <div className="rcpt-parties">
          <div><span>Billed to</span><b>{inv.customer}</b></div>
          <div><span>For</span><b>{inv.description}</b></div>
        </div>

        {inv.payments.length === 0 ? (
          <p className="rcpt-empty">No payments have been received against this invoice yet.</p>
        ) : (
          <table className="rcpt-table">
            <thead><tr><th>Date</th><th>From</th><th>Method</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.transactionId}>
                  <td>{new Date(p.time).toLocaleDateString()}</td>
                  <td>{p.sender}</td>
                  <td>{p.bankName ?? "Bank transfer"}{p.outcome === "reversed" ? " (reversed)" : ""}</td>
                  <td className="r mono">{NGN(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="rcpt-totals">
          <div><span>Invoice total</span><b className="mono">{NGN(inv.amount)}</b></div>
          <div><span>Total received</span><b className="mono">{NGN(received)}</b></div>
          <div className="grand"><span>{balance > 0 ? "Balance due" : "Status"}</span>
            <b className="mono">{balance > 0 ? NGN(balance) : (inv.status === "overpaid" ? "Overpaid" : "Paid in full")}</b></div>
        </div>

        <div className="rcpt-acct">
          <span>Paid to dedicated virtual account</span>
          <b className="mono">{inv.acctNumber}</b> · {inv.acctName} · {inv.bankName}
        </div>

        <div className="rcpt-verify">
          <span>Verification code</span>
          <code>{receiptHash(inv)}</code>
          <p>This code is derived from the receipt&apos;s figures — if any amount is altered it no longer matches PaidUp&apos;s records.</p>
          <div className="rcpt-verify-qr" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden="true" style={{ width: 96, height: 96 }} dangerouslySetInnerHTML={{ __html: verifyQr }} />
            <span style={{ fontSize: 12, color: "var(--faint)" }}>Scan to verify this payment is real at <span className="mono">{verifyUrl}</span></span>
          </div>
        </div>

        <div className="rcpt-actions print-hide">
          <PrintButton />
          <Link className="ghost" href={`/pay/${inv.payToken}`}>← Back to payment page</Link>
        </div>
      </div>
    </main>
  );
}
