import Link from "next/link";
import {
  ShieldCheck, ArrowRight, Play, CheckCircle2, Landmark, ArrowRightLeft,
  Webhook, Scale, Undo2, Copy, ShieldAlert, FileDown, Lock, Check, X,
} from "lucide-react";
import { ReconcileDemo } from "@/components/ReconcileDemo";
import { LandingMotion } from "@/components/LandingMotion";

export default function Landing() {
  return (
    <>
      <LandingMotion />

      <div className="site-head-wrap" data-head>
        <header className="site-head">
          <Link href="/" className="logo"><span className="mark">P</span><span>PaidUp</span></Link>
          <nav className="nav-links">
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#why">Why PaidUp</a>
          </nav>
          <div className="spacer" />
          <Link href="/app" className="btn-line">Sign in</Link>
          <Link href="/get-started" className="btn-line" style={{ background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" }}>Get started</Link>
        </header>
      </div>

      {/* ---------------- HERO ---------------- */}
      <section className="hero">
        <div className="lp-glow" aria-hidden="true" />

        <div className="lp-hero-copy">
          <div className="lp-eyebrow lp-anim" style={{ animationDelay: "0s" }}>
            <ShieldCheck size={15} /> Built on <b>Nomba</b> · bank-grade HMAC
          </div>
          <h1 className="lp-anim" style={{ animationDelay: ".08s" }}>
            Every transfer,<br />on the <em>right invoice.</em>
          </h1>
          <p className="lede lp-anim" style={{ animationDelay: ".16s" }}>
            Give each invoice its own account number. Money reconciles itself the moment it lands —
            <b> paid, partial, or flagged.</b>
          </p>
          <div className="cta lp-anim" style={{ animationDelay: ".24s" }}>
            <Link href="/get-started" className="btn-xl">Start free <ArrowRight size={18} /></Link>
            <Link href="/app" className="btn-ghost-xl"><Play size={16} /> See it live</Link>
          </div>
          <div className="lp-microtrust lp-anim" style={{ animationDelay: ".32s" }}>
            <CheckCircle2 size={15} /> Sandbox-ready · no card · first invoice in 60 seconds
          </div>
        </div>

        <div className="lp-hero-demo lp-anim" style={{ animationDelay: ".3s" }}>
          <ReconcileDemo />
        </div>
      </section>

      {/* ---------------- TRUST STRIP ---------------- */}
      <div className="lp-trust">
        <div className="lp-trust-in">
          <div className="lp-trust-lead">
            <ShieldCheck size={18} />
            <span>Powered by <b>Nomba</b> virtual accounts · 9-field HMAC verified · audit-grade ledger</span>
          </div>
          <div className="lp-trust-stats">
            <div><b data-count="100" data-suffix="%">100%</b><span>auto-matched</span></div>
            <div><b>0</b><span>manual entries</span></div>
            <div><b data-count="60" data-suffix="s">60s</b><span>to first invoice</span></div>
          </div>
        </div>
      </div>

      {/* ---------------- THE PROBLEM ---------------- */}
      <section className="section" id="problem">
        <div className="section-head" data-reveal>
          <span className="kicker">The reconciliation tax</span>
          <h2 className="section-title">You&apos;re paid by transfer. So every evening, you match by hand.</h2>
          <p className="section-lead">One account, every payer, a flood of look-alike &ldquo;payment&rdquo; narrations. PaidUp deletes the guesswork at the source.</p>
        </div>

        <div className="ba" data-ba data-reveal style={{ marginTop: 34 }}>
          <div className="ba-col before">
            <span className="kicker" style={{ color: "var(--attn)" }}>Today, without PaidUp</span>
            <h3>One account. Every payer.</h3>
            <div className="ba-acct">0123456789 · the business account</div>
            <ul>
              <li><X size={17} /><span>&ldquo;Transfer from JOHN G — <span className="mono">Pymt for inv 1050</span>&rdquo;</span></li>
              <li><X size={17} /><span><span className="mono">NIP/—/payment</span> · ₦20,000 — but against which invoice?</span></li>
              <li><X size={17} /><span>A spreadsheet, opened every night, matched by hand.</span></li>
            </ul>
          </div>
          <div className="ba-col after">
            <span className="kicker">With PaidUp</span>
            <h3>One account. Per invoice.</h3>
            <div className="ba-acct">3049420327 · INV-1042 only</div>
            <ul>
              <li><Check size={17} /><span>The account number <b>is</b> the reference — nothing to type.</span></li>
              <li><Check size={17} /><span>Transfer lands → matched instantly → invoice marked <b>Paid</b>.</span></li>
              <li><Check size={17} /><span>Partial, overpaid and unmatched — all handled automatically.</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <div className="section-head" data-reveal>
          <span className="kicker">The loop</span>
          <h2 className="section-title">How money finds its invoice.</h2>
          <p className="section-lead">Four steps, zero human matching. It runs the second funds arrive.</p>
        </div>
        <div className="loop" data-loop>
          <span className="loop-coin" data-loop-coin aria-hidden="true">₦</span>
          <div className="step" data-reveal>
            <div className="stepic"><Landmark size={20} /></div>
            <div className="no">01</div><h4>Provision</h4>
            <p>Create an invoice. PaidUp mints a dedicated Nomba virtual account just for it.</p>
          </div>
          <div className="step" data-reveal>
            <div className="stepic"><ArrowRightLeft size={20} /></div>
            <div className="no">02</div><h4>Customer pays</h4>
            <p>They transfer to that account number from any Nigerian bank — no portal, no login.</p>
          </div>
          <div className="step" data-reveal>
            <div className="stepic"><Webhook size={20} /></div>
            <div className="no">03</div><h4>Webhook</h4>
            <p>Nomba fires a signed <span className="mono">payment_success</span> the instant funds land.</p>
          </div>
          <div className="step" data-reveal>
            <div className="stepic"><CheckCircle2 size={20} /></div>
            <div className="no">04</div><h4>Reconciled</h4>
            <p>Matched by account reference, classified paid / partial / over, ledger updated live.</p>
          </div>
        </div>
      </section>

      {/* ---------------- WHY / CAPABILITIES ---------------- */}
      <section className="section" id="why" style={{ paddingTop: 0 }}>
        <div className="section-head" data-reveal>
          <span className="kicker">Why PaidUp</span>
          <h2 className="section-title">Nomba ships the rails.<br />We ship the ledger.</h2>
          <p className="section-lead">Virtual accounts and webhooks are powerful primitives — but they leave you to answer &ldquo;who paid, how much, against what?&rdquo; That reconciliation layer is the whole product.</p>
        </div>

        <div className="bento">
          <div className="cell" data-reveal>
            <div className="cellic"><Scale size={20} /></div>
            <h4>Under-paid</h4>
            <p>Tracks a running balance and keeps the invoice open until it&apos;s fully settled.</p>
          </div>
          <div className="cell" data-reveal>
            <div className="cellic"><Undo2 size={20} /></div>
            <h4>Over-paid</h4>
            <p>Flags the surplus and refunds it to the payer in one tap, over the Nomba rails.</p>
          </div>
          <div className="cell" data-reveal>
            <div className="cellic"><Copy size={20} /></div>
            <h4>Duplicate</h4>
            <p>Idempotent on transaction id — a retried webhook never double-counts a payment.</p>
          </div>
          <div className="cell ink wide" data-reveal>
            <div className="cellic"><ShieldAlert size={20} /></div>
            <h4>Misdirected transfers never get lost</h4>
            <p>Unmatched money is quarantined for review with a smart suggested match — assign it to the right invoice or bounce it back to the sender. Nothing silently disappears.</p>
          </div>
          <div className="cell gold" data-reveal>
            <div className="cellic"><FileDown size={20} /></div>
            <h4>Audit-grade export</h4>
            <p>One-click CSV: the full reconciliation ledger or a per-invoice customer statement.</p>
          </div>
        </div>
      </section>

      {/* ---------------- EDITORIAL STATEMENT ---------------- */}
      <section className="statement-wrap" aria-label="The idea behind PaidUp">
        <p className="statement" data-words>
          You shouldn&apos;t have to recognise a payment. The account it landed in already knows which invoice it belongs to.
        </p>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="section" id="start" style={{ paddingTop: 0 }}>
        <div className="cta-card" data-reveal>
          <div>
            <h2 className="section-title">Stop matching transfers by hand.</h2>
            <p className="sub">Mint your first invoice and its virtual account in under a minute — sandbox-ready, no card.</p>
          </div>
          <Link href="/get-started" className="btn-xl">Get started <ArrowRight size={18} /></Link>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="site-foot">
        <div className="in">
          <div className="brandcol">
            <div className="logo"><span className="mark">P</span><span>PaidUp</span></div>
            <p>Per-invoice reconciliation on Nomba. Give every invoice its own account number and let the money reconcile itself.</p>
          </div>
          <div className="lcols">
            <div className="lcol">
              <h5>Product</h5>
              <a href="#how">How it works</a>
              <a href="#why">Why PaidUp</a>
              <Link href="/app">Live dashboard</Link>
              <Link href="/get-started">Get started</Link>
            </div>
            <div className="lcol">
              <h5>Trust</h5>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "13.5px", marginBottom: 10 }}><Lock size={13} /> 9-field HMAC verified</span>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "13.5px", marginBottom: 10 }}><ShieldCheck size={13} /> Fails closed in production</span>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: "13.5px" }}><FileDown size={13} /> Audit-grade export</span>
            </div>
          </div>
        </div>
        <div className="foot-base">
          <div className="in">
            <span>PaidUp — built on Nomba · Cresiolabs</span>
            <span>Nomba × DevCareer Hackathon 2026</span>
          </div>
        </div>
      </footer>
    </>
  );
}
