import type { Metadata } from "next";
import { headers } from "next/headers";
import { getInvoiceByToken, BUSINESS_NAME } from "@/lib/store";
import { qrSvg, payInstruction } from "@/lib/qr";
import { NGN } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { whatsappShareUrl, payMessage } from "@/lib/share";
import { PayStatusPoller } from "./PayStatusPoller";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pay your invoice — PaidUp",
  robots: { index: false, follow: false }, // payment links are private/shared, not for search engines
};

// Public, shareable customer payment page (POLISH M1). Reached by an unguessable token so invoice ids
// stay un-enumerable. Shows only what a payer needs — amount, the dedicated Nomba virtual account, and
// a scannable QR — never the rest of the ledger. Lives outside /app + /api, so it's reachable even when
// the operator dashboard is password-gated.
export default async function PayPage({ params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard">
          <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> PaidUp</div>
          <div className="empty-state" style={{ padding: "36px 8px" }}>
            <span className="ico">🔗</span>
            <b>This payment link isn&apos;t valid</b>
            <span>The link may have expired or been mistyped. Ask the business to resend it.</span>
          </div>
        </div>
      </main>
    );
  }

  const remaining = Math.max(Math.round((inv.amount - inv.paid) * 100) / 100, 0);
  const isPaid = inv.status === "paid" || inv.paid >= inv.amount;
  const overpaid = inv.status === "overpaid";
  const qr = await qrSvg(payInstruction({ amount: remaining || inv.amount, acctNumber: inv.acctNumber, bankName: inv.bankName, ref: inv.id }));
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "paidup.site"}`;
  const waUrl = whatsappShareUrl(payMessage({ customer: inv.customer, id: inv.id, amount: remaining || inv.amount, url: `${origin}/pay/${inv.payToken}` }));

  return (
    <main className="paypage">
      <div className="paycard">
        <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> PaidUp</div>

        <p className="pay-kicker">Payment request from</p>
        <h1 className="pay-h1">{BUSINESS_NAME}</h1>
        <p className="pay-desc">Billed to {inv.customer} · {inv.description} · <span className="mono">{inv.id}</span></p>

        {isPaid ? (
          <div className="pay-settled" role="status">
            <span className="big">{overpaid ? "Overpaid — thank you" : "✓ Payment received"}</span>
            <span>Your transfer landed and was matched to this invoice. You&apos;re all set — keep the receipt for your records.</span>
            <a className="pay-receipt-link" href={`/pay/${inv.payToken}/receipt`}>View / download receipt →</a>
          </div>
        ) : (
          <>
            <div className="pay-amount">
              <span className="lab">{inv.paid > 0 ? "Balance due" : "Amount due"}</span>
              <span className="big naira">{NGN(remaining)}</span>
              {inv.paid > 0 && <span className="part">{NGN(inv.paid)} of {NGN(inv.amount)} received</span>}
            </div>

            <div className="pay-acct">
              <div>
                <span className="lab">Transfer from any bank to</span>
                <div className="acctno mono">{inv.acctNumber}</div>
                <div className="bank">{inv.acctName} · {inv.bankName}</div>
              </div>
              <CopyButton value={inv.acctNumber} label="Copy account" />
            </div>

            <div className="pay-qr">
              <div className="qrbox" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />
              <span className="sr-only">Transfer to account number {inv.acctNumber}, {inv.acctName}, {inv.bankName}.</span>
              <p>Scanning from another device? The QR carries the same details. On this phone, just copy the account number above — your payment reconciles automatically the moment it lands.</p>
            </div>
            <a className="copy" style={{ display: "inline-block", marginTop: 8 }} target="_blank" rel="noopener noreferrer" href={waUrl}>↗ Share this on WhatsApp</a>
            <p className="pay-listening" style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>
              <span className="live-dot" aria-hidden="true" /> Waiting for your transfer — this page updates itself the moment it lands.
            </p>
            {inv.payToken && <PayStatusPoller token={inv.payToken} />}
          </>
        )}

        <p className="pay-foot">Secured by <b>Nomba</b> · this account belongs to this invoice alone · pay from any Nigerian bank app.</p>
      </div>
    </main>
  );
}
