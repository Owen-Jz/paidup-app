import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck, ArrowRight, Play, CheckCircle2, Landmark, ArrowRightLeft,
  Scale, Undo2, Copy, ShieldAlert, FileDown, Lock, Check, X,
} from "lucide-react";
import { ReconcileDemo } from "@/components/ReconcileDemo";
import { LandingMotion } from "@/components/LandingMotion";
import { StoryScroll } from "@/components/StoryScroll";
import { LoopScroll } from "@/components/LoopScroll";

export default function Landing() {
  return (
    <>
      <LandingMotion />

      <div className="site-head-wrap" data-head>
        <header className="site-head">
          <Link href="/" className="logo"><img src="/logo.svg" alt="" className="brand-logo" width={32} height={32} /><span>PaidUp</span></Link>
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

      {/* ---------------- HERO — bento ---------------- */}
      <section className="bento-hero" aria-label="PaidUp">
        <div className="lp-glow" aria-hidden="true" />

        {/* A · headline + CTAs */}
        <div className="bh-head bh-in" style={{ animationDelay: "0s" }}>
          <div className="lp-eyebrow">
            <ShieldCheck size={15} /> Built on <b>Nomba</b> · bank-grade HMAC
          </div>
          <h1>Every transfer,<br />on the <em>right invoice.</em></h1>
          <div className="cta">
            <Link href="/get-started" className="btn-xl">Start free <ArrowRight size={18} /></Link>
            <Link href="/app" className="btn-ghost-xl"><Play size={16} /> See it live</Link>
          </div>
          <div className="lp-microtrust">
            <CheckCircle2 size={15} /> No card · first invoice in 60 seconds
          </div>
        </div>

        {/* B · the one-line promise */}
        <div className="bh-card bh-blurb bh-in" style={{ animationDelay: ".09s" }}>
          <svg className="bh-watermark" viewBox="0 0 64 64" aria-hidden="true" fill="none">
            <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
              <rect x="3" y="3" width="58" height="58" rx="15" />
              <path d="M22 15 v34" />
              <path d="M22 15 h9 a11.5 11.5 0 0 1 0 23 h-9" />
              <circle cx="43.5" cy="45.5" r="10" />
              <path d="M39.2 45.8 l3 3.1 l5.9 -6.7" />
            </g>
          </svg>
          <span className="bh-icon" aria-hidden="true">₦</span>
          <b>Every invoice gets its own virtual account.</b>
          <p>Your customer just transfers from any bank app — PaidUp already knows exactly what they paid for. No reference. No guessing.</p>
          <div className="bh-vacct" aria-hidden="true">
            <span className="mono">Virtual account · INV-1042</span>
            <b className="mono">3049 420 327</b>
          </div>
        </div>

        {/* D · the engine room: the SME owner + what she can do */}
        <div className="bh-card bh-show bh-in" style={{ animationDelay: ".18s" }}>
          <div className="bh-photo">
            <span className="px p1" aria-hidden="true" /><span className="px p2" aria-hidden="true" />
            <span className="px p3" aria-hidden="true" /><span className="px p4" aria-hidden="true" />
            <span className="px p5" aria-hidden="true" />
            <Image src="/hero-sme.png" alt="A business owner smiling at her phone as her invoices reconcile themselves" width={512} height={462} priority />
          </div>
          <div className="bh-pills">
            <span className="bh-pill gold"><i><Landmark size={16} /></i> Mint a virtual account</span>
            <span className="bh-pill mint"><i><ArrowRightLeft size={16} /></i> Auto-reconcile transfers</span>
            <span className="bh-pill amber"><i><Undo2 size={16} /></i> Refund overpayments</span>
            <span className="bh-pill line"><i><FileDown size={16} /></i> Export the audit ledger</span>
          </div>
        </div>

        {/* C + E · live ticker over the interactive demo */}
        <div className="bh-right">
          <div className="bh-card bh-ticker bh-in" style={{ animationDelay: ".27s" }}>
            <span className="bh-ticker-lab mono"><i />LIVE · reconciling</span>
            <div className="bh-ticker-clip" aria-hidden="true">
              <div className="bh-ticker-track">
                {[0, 1].map((n) => (
                  <div key={n} className="bh-ticker-set">
                    <div className="bh-tick"><span className="mono">₦450,000 → INV-1042</span><b className="ok">PAID</b></div>
                    <div className="bh-tick"><span className="mono">₦28,000 → INV-1043</span><b className="part">PARTIAL</b></div>
                    <div className="bh-tick"><span className="mono">₦1,300,000 → INV-1046</span><b className="ok">PAID</b></div>
                    <div className="bh-tick"><span className="mono">₦75,500 → no match</span><b className="held">HELD</b></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bh-demo bh-in" style={{ animationDelay: ".36s" }}>
            <ReconcileDemo />
          </div>
        </div>
      </section>

      {/* ---------------- TRUST STRIP (immediately under the hero) ---------------- */}
      <div className="lp-trust">
        <div className="lp-trust-in">
          <div className="lp-trust-lead">
            <ShieldCheck size={18} />
            <span>Built on <b>Nomba</b> virtual accounts — <b>9-field HMAC-verified</b> webhooks, an <b>audit-grade</b> ledger.</span>
          </div>
          <div className="lp-trust-stats">
            <div><b data-count="100" data-suffix="%">100%</b><span>of transfers auto-matched or safely flagged</span></div>
            <div><b>Zero</b><span>payments matched by hand</span></div>
            <div><b data-count="60" data-suffix="s">60s</b><span>to your first live invoice</span></div>
            <div><b>CSV</b><span>one-tap audit-grade export</span></div>
          </div>
        </div>
      </div>

      {/* ---------------- THE STORY: evening ritual → PaidUp ends that ---------------- */}
      <StoryScroll />

      {/* ---------------- THE PROBLEM ---------------- */}
      <section className="section" id="problem">
        <div className="section-head" data-reveal>
          <span className="kicker">The reconciliation tax</span>
          <h2 className="section-title">You&apos;re paid by transfer. So every evening, you match by hand.</h2>
          <p className="section-lead">One account, every payer, a flood of look-alike &ldquo;payment&rdquo; narrations. PaidUp deletes the guesswork at the source.</p>
        </div>

        <div className="cmp" data-ba data-reveal style={{ marginTop: 40 }}>
          <div className="cmp-card without">
            <div className="cmp-tag bad"><X size={15} /> Without PaidUp</div>
            <h3>You are the reconciliation engine.</h3>
            <div className="cmp-acct bad">
              <b className="mono">0123456789</b>
              <small>one account · every customer pays here</small>
            </div>
            <ul>
              <li><span className="ic"><X size={14} /></span><span>&ldquo;Transfer from JOHN G — <span className="mono">Pymt for inv 1050</span>&rdquo; — is that this month&apos;s or last?</span></li>
              <li><span className="ic"><X size={14} /></span><span><span className="mono">NIP/—/payment</span> · ₦20,000 — but against <em>which</em> invoice?</span></li>
              <li><span className="ic"><X size={14} /></span><span>Every evening: open the spreadsheet, cross-check alerts, match by hand.</span></li>
            </ul>
            <div className="cmp-foot bad">Result — hours lost, money mismatched, customers chased twice.</div>
          </div>

          <div className="cmp-vs" aria-hidden="true"><span>vs</span></div>

          <div className="cmp-card with">
            <div className="cmp-tag good"><Check size={15} /> With PaidUp</div>
            <h3>The account number does the matching.</h3>
            <div className="cmp-acct good">
              <b className="mono">3049420327</b>
              <small>a dedicated account · for INV-1042 alone</small>
            </div>
            <ul>
              <li><span className="ic"><Check size={14} /></span><span>The account number <b>is</b> the reference — the customer types nothing.</span></li>
              <li><span className="ic"><Check size={14} /></span><span>Transfer lands → matched instantly → invoice flips to <b>Paid</b>.</span></li>
              <li><span className="ic"><Check size={14} /></span><span>Partial, overpaid and unmatched money — all handled for you.</span></li>
            </ul>
            <div className="cmp-foot good">Result — reconciled the second money lands. Nothing typed by hand.</div>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS — pinned horizontal scroll ---------------- */}
      <LoopScroll />

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
            <div className="logo"><img src="/logo.svg" alt="" className="brand-logo" width={28} height={28} /><span>PaidUp</span></div>
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
