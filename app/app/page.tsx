"use client";

import { useState } from "react";
import Link from "next/link";
import { useDashboard, Chip, SyncStatus, CountUp } from "@/components/dashboard";
import { GuidedTour, type TourStep } from "@/components/GuidedTour";
import { NGN, eventIcon, timeAgo, shortName } from "@/lib/format";

// Guided tour steps — anchored to real elements on this page + the sidebar nav (data-tour="…").
const TOUR: TourStep[] = [
  { title: "Welcome to PaidUp 👋", body: "A 30-second tour of how your money reconciles itself here. You can skip anytime." },
  { selector: '[data-tour="kpis"]', title: "Your money at a glance", body: "Collected, invoiced, still outstanding, and what needs a look — all updated live as payments land." },
  { selector: '[data-tour="feed"]', title: "It reconciles itself", body: "Every bank transfer appears here and is matched to its invoice automatically — by that invoice's own virtual account. Nothing is typed by hand." },
  { selector: '[data-tour="attention"]', title: "Nothing slips through", body: "Overpayments, unmatched money and anomalies get flagged for you — with AI suggestions you can accept or override." },
  { selector: '[data-tour="nav"]', title: "Everything in one place", body: "Invoices (each gets its own account, with refunds & receipts), Withdraw to your bank, printable Reports & a tamper-evident audit trail, and Settings." },
  { title: "That's the loop 🎉", body: "Open Invoices to create one and watch a payment reconcile end-to-end. Enjoy exploring!" },
];

export default function LivePage() {
  const { invoices, events, quarantine, kpis, flashId, loading, error, sync } = useDashboard();
  const [brief, setBrief] = useState<{ text: string; source: string } | null>(null);
  const [briefing, setBriefing] = useState(false);

  const generateBrief = async () => {
    setBriefing(true);
    try {
      const r = await fetch("/api/summary", { method: "POST" });
      const j = await r.json();
      if (j.summary) setBrief({ text: j.summary, source: j.source });
    } catch {
      setBrief({ text: "Could not generate a brief right now.", source: "error" });
    }
    setBriefing(false);
  };

  const evBg: Record<string, string> = {
    paid: "var(--paid-bg)", partial: "var(--partial-bg)", overpaid: "var(--over-bg)",
    quarantine: "var(--attn-bg)", duplicate: "var(--await-bg)", refunded: "var(--paid-bg)",
    reversed: "var(--attn-bg)", withdrawal: "var(--await-bg)",
  };
  const outstanding = invoices.filter((i) => i.paid < i.amount).sort((a, b) => (b.amount - b.paid) - (a.amount - a.paid)).slice(0, 4);

  // Status composition for the reconciliation breakdown card.
  const bd = { paid: { n: 0, amt: 0 }, partial: { n: 0, amt: 0 }, overpaid: { n: 0, amt: 0 }, awaiting: { n: 0, amt: 0 } };
  for (const i of invoices) {
    const k = (i.status === "paid" || i.status === "partial" || i.status === "overpaid") ? i.status : "awaiting";
    bd[k].n++; bd[k].amt += i.amount;
  }
  const totalInv = invoices.length || 1;
  const bpct = (n: number) => `${(n / totalInv) * 100}%`;

  // Screen-reader announcement for the newest reconciliation. The string only changes when a new top
  // event arrives, so aria-live fires once per real payment (not on every 2s poll).
  const top = events[0];
  const liveMsg = top
    ? `${top.customer} ${top.outcome === "quarantine" ? "sent an unmatched payment of" : top.outcome} ${NGN(top.amount)}${top.invoiceId ? `, invoice ${top.invoiceId}` : ""}.`
    : "";

  return (
    <main>
      <div className="page-head">
        <div>
          <h1 className="h1">Live collections</h1>
          <p className="sub">Money lands → matched by virtual-account reference → reconciled automatically. Nothing here is typed by hand.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="page-live"><i />Reconciling live</span>
          <button className="ghost sm" onClick={() => window.dispatchEvent(new Event("paidup:tour"))} title="Replay the guided tour">❔ Take a tour</button>
          <Link className="btn sm" href="/app/invoices?new=1" style={{ textDecoration: "none" }}>+ New invoice</Link>
        </div>
      </div>

      {error && <div className="banner err" role="alert">⚠ Lost connection to the ledger — retrying…</div>}
      <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>

      <div className="kpis" data-tour="kpis">
        <div className="kpi accent"><div className="lab">Collected</div><div className="val naira">{NGN(kpis.collected)}</div><div className="delta">{kpis.rate}% of invoiced</div></div>
        <div className="kpi"><div className="lab">Invoiced</div><div className="val naira">{NGN(kpis.invoiced)}</div><div className="delta">{invoices.length} invoices</div></div>
        <div className="kpi"><div className="lab">Outstanding</div><div className="val naira" style={{ color: "var(--partial)" }}>{NGN(kpis.outstanding)}</div><div className="delta">{invoices.filter((i) => i.paid < i.amount).length} open</div></div>
        <Link href="/app/invoices?filter=attn" className="kpi" data-tour="attention" style={{ textDecoration: "none", cursor: "pointer" }} aria-label={`Needs attention: ${quarantine.length} unmatched — review`}><div className="lab">Needs attention</div><div className="val" style={{ color: "var(--attn)" }}>{kpis.attention}</div><div className="delta">{quarantine.length} unmatched · review →</div></Link>
      </div>

      <div className="grid2">
        <div className="feed" data-tour="feed">
          <div className="fh">
            <span className="live"><i />LIVE</span>
            <span style={{ color: "var(--faint)", fontSize: 12, fontFamily: "var(--mono)" }}>money in &amp; out</span>
            <span style={{ marginLeft: "auto" }}><SyncStatus sync={sync} /></span>
          </div>
          {events.map((e) => {
            const isFlash = flashId === (e.invoiceId ?? e.id);
            const isWin = isFlash && (e.outcome === "paid" || e.outcome === "overpaid");
            return (
            <div className={`event ${isFlash ? "flash" : ""} ${isWin ? "win" : ""}`} key={e.id}>
              <div className="ic" style={{ background: evBg[e.outcome] }}>{eventIcon(e.outcome)}</div>
              <div>
                <div className="who-line">{e.customer}{e.outcome !== "withdrawal" && <span style={{ color: "var(--faint)", fontWeight: 500 }}> → {e.invoiceId ?? "no match"}</span>}</div>
                <div className="meta">{e.bankName} · <span className="mono">{e.narration}</span>
                  {e.outcome === "quarantine" && <Link href="/app/invoices?filter=attn" style={{ color: "var(--attn)", fontWeight: 600, textDecoration: "none", marginLeft: 6 }}>· resolve →</Link>}
                </div>
              </div>
              <div className="amt">{e.outcome === "withdrawal" ? `− ${NGN(e.amount)}` : NGN(e.amount)} <Chip status={e.outcome} /><small>{timeAgo(e.time)}</small></div>
            </div>
          );})}
          {loading && events.length === 0 && Array.from({ length: 4 }).map((_, n) => (
            <div className="event" key={`sk${n}`}>
              <div className="skel skel-ic" />
              <div style={{ width: "100%" }}><div className="skel skel-line" style={{ width: "55%" }} /><div className="skel skel-line" style={{ width: "35%", marginTop: 8 }} /></div>
              <div className="skel skel-line" style={{ width: 60 }} />
            </div>
          ))}
          {!loading && events.length === 0 && (
            <div className="empty-state">
              <span className="ico">⚡</span>
              <b>Waiting for the first payment</b>
              <span>Create an invoice and share its account number or pay link — the moment your customer transfers, the payment lands here and reconciles itself.</span>
              <Link className="btn sm" href="/app/invoices?new=1" style={{ marginTop: 10, textDecoration: "none" }}>+ Create your first invoice</Link>
            </div>
          )}
        </div>

        <div>
          <div className="railcard">
            <h4>Collection rate</h4>
            <div className="donut" role="img" aria-label={`Collection rate ${kpis.rate}%, ${NGN(kpis.collected)} collected`} style={{ ["--rate" as string]: kpis.rate } as React.CSSProperties}>
              <div className="in" aria-hidden="true"><div><b><CountUp value={kpis.rate} suffix="%" /></b><span>{NGN(kpis.collected)}</span></div></div>
            </div>
            <div className="outrow"><span style={{ color: "var(--muted)" }}>Invoiced</span><b className="naira">{NGN(kpis.invoiced)}</b></div>
            <div className="outrow"><span style={{ color: "var(--muted)" }}>Outstanding</span><b className="naira" style={{ color: "var(--partial)" }}>{NGN(kpis.outstanding)}</b></div>
            <div className="outrow"><span style={{ color: "var(--muted)" }}>Needs attention</span><b style={{ color: "var(--attn)" }}>{kpis.attention}</b></div>
          </div>
          <div className="railcard">
            <h4>Reconciliation breakdown</h4>
            <div className="bd-bar" role="img" aria-label="Invoice status composition">
              <i className="paid" style={{ width: bpct(bd.paid.n) }} />
              <i className="partial" style={{ width: bpct(bd.partial.n) }} />
              <i className="over" style={{ width: bpct(bd.overpaid.n) }} />
              <i className="await" style={{ width: bpct(bd.awaiting.n) }} />
            </div>
            <ul className="bd-list">
              <li><span className="bd-dot paid" /><span>Paid</span><span className="bd-amt">{NGN(bd.paid.amt)}</span><b>{bd.paid.n}</b></li>
              <li><span className="bd-dot partial" /><span>Partial</span><span className="bd-amt">{NGN(bd.partial.amt)}</span><b>{bd.partial.n}</b></li>
              <li><span className="bd-dot over" /><span>Overpaid</span><span className="bd-amt">{NGN(bd.overpaid.amt)}</span><b>{bd.overpaid.n}</b></li>
              <li><span className="bd-dot await" /><span>Awaiting</span><span className="bd-amt">{NGN(bd.awaiting.amt)}</span><b>{bd.awaiting.n}</b></li>
              <li><span className="bd-dot attn" /><span>Unmatched</span><span className="bd-amt"><Link href="/app/invoices?filter=attn" style={{ color: "var(--attn)", textDecoration: "none" }}>review →</Link></span><b>{quarantine.length}</b></li>
            </ul>
          </div>
          <div className={`railcard brief${briefing ? " loading" : ""}`}>
            <h4>✨ AI reconciliation brief</h4>
            {brief ? (
              <>
                <p className="brief-text">{brief.text}</p>
                <div className="brief-foot">
                  <span className="brief-src">{brief.source === "ai" ? "Written by MiniMax" : brief.source === "template" ? "AI unavailable — auto-generated" : "—"}</span>
                  <button className="ghost sm" onClick={generateBrief} disabled={briefing}>{briefing ? "…" : "↻ Regenerate"}</button>
                </div>
              </>
            ) : (
              <>
                <p className="brief-empty">A plain-English read on where your money is and what needs you.</p>
                <button className="btn sm" onClick={generateBrief} disabled={briefing}>{briefing ? "Generating…" : "Generate brief"}</button>
              </>
            )}
          </div>
          <div className="railcard">
            <h4>Top outstanding</h4>
            {outstanding.map((i) => (
              <Link className="outrow" key={i.id} href="/app/invoices?filter=open"
                style={{ textDecoration: "none", color: "inherit" }}
                aria-label={`Open invoices — ${shortName(i.customer)} owes ${NGN(i.amount - i.paid)}`}>
                <span>{shortName(i.customer)}</span><b className="naira">{NGN(i.amount - i.paid)}</b>
              </Link>
            ))}
            {outstanding.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13 }}>All settled 🎉</div>}
          </div>
        </div>
      </div>

      <GuidedTour steps={TOUR} />
    </main>
  );
}
