import type { Metadata } from "next";
import Link from "next/link";
import { getInvoiceByToken } from "@/lib/store";
import { receiptHash, receiptNumber, paymentSummary } from "@/lib/receipt";
import { NGN } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify payment — PaidUp", robots: { index: false, follow: false } };

// Public anti-fake-alert verification page. Anyone (payer, the business, a third party) can reach it via
// the unguessable pay token and confirm a payment is REAL: it reads the authoritative ledger, shows the
// received total + tamper-evident code, and — unlike a bank SMS — cannot be forged. Payer-only fields.
export default async function VerifyPage({ params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard"><div className="empty-state" style={{ padding: "36px 8px" }}>
          <span className="ico">🔗</span><b>Nothing to verify</b>
          <span>This verification link is invalid or expired. Ask the business to resend it.</span>
        </div></div>
      </main>
    );
  }

  const { received, lastTime, count } = paymentSummary(inv);
  const verified = count > 0;

  return (
    <main className="paypage">
      <div className="paycard">
        <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> PaidUp</div>

        {verified ? (
          <div className="pay-settled" role="status">
            <span className="big">✓ Payment verified</span>
            <span>
              <b className="naira">{NGN(received)}</b> received against <span className="mono">{inv.id}</span>
              {lastTime ? <> · last payment {new Date(lastTime).toLocaleString()}</> : null}.
            </span>
            <span>Billed to {inv.customer} · {inv.description}</span>
          </div>
        ) : (
          <div className="pay-amount" style={{ marginTop: 8 }}>
            <span className="lab">No payment recorded yet</span>
            <span className="big naira">{NGN(inv.amount)}</span>
            <span className="part">This invoice ({inv.id}) has not been paid. Nothing to verify — do not release goods on the strength of an SMS alert.</span>
          </div>
        )}

        <div className="rcpt-verify" style={{ marginTop: 18 }}>
          <span>Verification code</span>
          <code>{receiptHash(inv)}</code>
          <p>This code is derived from PaidUp&apos;s ledger figures for {receiptNumber(inv)}. A bank alert SMS can be faked — this record is confirmed against the money PaidUp actually received, and the code changes if any figure is altered.</p>
        </div>

        <div className="rcpt-actions print-hide" style={{ marginTop: 16 }}>
          <Link className="ghost" href={`/pay/${inv.payToken}`}>← Back to payment page</Link>
          <Link className="ghost" href={`/pay/${inv.payToken}/receipt`}>View full receipt →</Link>
        </div>

        <p className="pay-foot">Verified by <b>PaidUp</b> · reconciled from an HMAC-verified Nomba bank webhook · not an SMS.</p>
      </div>
    </main>
  );
}
