import type { Metadata } from "next";
import { getInvoiceByToken } from "@/lib/store";
import { qrSvg, payInstruction } from "@/lib/qr";
import { NGN } from "@/lib/format";
import { CopyButton } from "./CopyButton";

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
  const inv = getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard">
          <div className="pay-brand"><span className="mark">P</span> PaidUp</div>
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

  return (
    <main className="paypage">
      <div className="paycard">
        <div className="pay-brand"><span className="mark">P</span> PaidUp</div>

        <p className="pay-kicker">Payment request</p>
        <h1 className="pay-h1">{inv.customer}</h1>
        <p className="pay-desc">{inv.description} · <span className="mono">{inv.id}</span></p>

        {isPaid ? (
          <div className="pay-settled" role="status">
            <span className="big">{overpaid ? "Overpaid — thank you" : "Paid in full"}</span>
            <span>This invoice is settled. Nothing more to pay.</span>
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
              <div className="qrbox" aria-label="QR code with the transfer details" dangerouslySetInnerHTML={{ __html: qr }} />
              <p>Scan for the transfer details. Your payment reconciles automatically the moment it lands — no reference to type.</p>
            </div>
          </>
        )}

        <p className="pay-foot">Secured by <b>PaidUp</b> on Nomba · this account is dedicated to this invoice only.</p>
      </div>
    </main>
  );
}
