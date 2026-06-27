import Link from "next/link";

export default function Landing() {
  return (
    <>
      <div className="site-head">
        <Link href="/" className="logo"><span className="mark">P</span><span>PaidUp</span></Link>
        <nav className="nav-links">
          <a href="#how">How it works</a>
          <a href="#why">Why PaidUp</a>
        </nav>
        <div className="spacer" />
        <Link href="/app" className="btn-line" style={{ marginRight: 10 }}>Sign in</Link>
        <Link href="/get-started" className="btn-line" style={{ background: "var(--ink)", color: "var(--paper)" }}>Get started</Link>
      </div>

      <section className="hero">
        <div>
          <div className="hero-eyebrow"><span className="ln" /><span className="kicker">For freelancers & SMEs who chase transfers</span></div>
          <h1>Every payment,<br />on the <em>right invoice.</em></h1>
          <p className="lede">
            In Nigeria almost every business is paid by bank transfer — into one account, with narrations
            like “payment”. So you reconcile by hand, in a spreadsheet. PaidUp gives each invoice its own
            account number, so every transfer matches itself — paid, partial, or flagged.
          </p>
          <div className="cta">
            <Link href="/get-started" className="btn-xl">Get started →</Link>
            <Link href="/app" className="btn-line">See it live</Link>
            <span className="note">Sandbox-ready · no card</span>
          </div>
          <div className="hero-stats">
            <div><b>1 : 1</b><span>account per invoice</span></div>
            <div><b>&lt; 2s</b><span>to reconcile a transfer</span></div>
            <div><b>0</b><span>spreadsheets</span></div>
          </div>
        </div>

        <div className="receipt">
          <div className="rh"><b>Invoice INV-1042</b><span className="chip c-paid"><span className="dot" />Paid</span></div>
          <div className="rrow"><span>Dangote Cement Plc</span><span className="mono">200 bags</span></div>
          <div className="rrow"><span>Virtual account</span><span className="mono">3049420327 · Nombank</span></div>
          <div className="rrow"><span>Received from</span><span className="mono">GTBank transfer</span></div>
          <div className="total"><span style={{ color: "var(--muted)", fontSize: 13 }}>Amount due</span><span className="naira">₦450,000</span></div>
          <div className="stamp">✓ Reconciled automatically</div>
        </div>
      </section>

      <section className="section" id="before">
        <div className="ba">
          <div className="ba-col before">
            <span className="kicker" style={{ color: "var(--attn)" }}>Today</span>
            <h3>One account. Every payer.</h3>
            <div className="ba-acct mono">0123456789 · the business account</div>
            <ul>
              <li>“Transfer from JOHN G — <span className="mono">“Pymt for inv 1050”</span>”</li>
              <li>“NIP/—/payment” &nbsp;·&nbsp; ₦20,000, but which invoice?</li>
              <li>A spreadsheet, opened every evening, matched by hand.</li>
            </ul>
          </div>
          <div className="ba-col after">
            <span className="kicker">With PaidUp</span>
            <h3>One account. Per invoice.</h3>
            <div className="ba-acct mono">3049420327 · INV-1042 only</div>
            <ul>
              <li>The account number <b>is</b> the reference — nothing to type.</li>
              <li>Transfer lands → matched in &lt; 2s → invoice marked Paid.</li>
              <li>Partial, overpaid, and unmatched all handled automatically.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <span className="kicker">The loop</span>
        <h2 className="section-title">How money finds its invoice.</h2>
        <div className="loop">
          <div className="step"><div className="no">01</div><h4>Provision</h4><p>Create an invoice. PaidUp mints a dedicated Nomba virtual account just for it.</p></div>
          <div className="step"><div className="no">02</div><h4>Customer pays</h4><p>They transfer to that account number from any Nigerian bank — no portal, no login.</p></div>
          <div className="step"><div className="no">03</div><h4>Webhook</h4><p>Nomba fires a signed <span className="mono">payment_success</span> the instant funds land.</p></div>
          <div className="step"><div className="no">04</div><h4>Reconciled</h4><p>Matched by account reference, classified paid / partial / over, ledger updated live.</p></div>
        </div>
      </section>

      <section className="section" id="why" style={{ paddingTop: 0 }}>
        <div className="why-split">
          <div>
            <span className="kicker">Why PaidUp</span>
            <h2 className="section-title" style={{ marginTop: 8 }}>Nomba ships the rails.<br />We ship the ledger.</h2>
            <p className="sub" style={{ fontSize: 15.5 }}>
              Virtual accounts and transfer-in webhooks are powerful primitives — but they leave you to
              answer “who paid, how much, against what?” PaidUp is that missing reconciliation layer:
              under-payments, over-payments, duplicates and misdirected transfers, all handled.
            </p>
          </div>
          <div className="loop why-cards">
            <div className="step"><h4>Under-paid</h4><p>Tracks a running balance and keeps the invoice open until it’s settled.</p></div>
            <div className="step" style={{ borderRight: "none" }}><h4>Over-paid</h4><p>Flags the surplus and refunds it back to the payer in one tap.</p></div>
            <div className="step" style={{ borderRight: "1px solid var(--line)" }}><h4>Duplicate</h4><p>Idempotent on transaction id — a retried webhook never double-counts.</p></div>
            <div className="step" style={{ borderRight: "none" }}><h4>Misdirected</h4><p>Unmatched transfers are quarantined for review, never lost.</p></div>
          </div>
        </div>
      </section>

      <footer className="site-foot">
        <div className="in">
          <span>PaidUp — built on Nomba · Cresiolabs</span>
          <span>Nomba × DevCareer Hackathon 2026</span>
        </div>
      </footer>
    </>
  );
}
