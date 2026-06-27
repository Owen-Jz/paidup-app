"use client";

import { useState } from "react";
import { useDashboard, Chip, SimPanel, CountUp } from "@/components/dashboard";
import { NGN, eventIcon, timeAgo, shortName } from "@/lib/format";

export default function LivePage() {
  const { invoices, events, kpis, flashId, loading, error, simulate, sync, reverseLast } = useDashboard();
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
  };
  const outstanding = invoices.filter((i) => i.paid < i.amount).sort((a, b) => (b.amount - b.paid) - (a.amount - a.paid)).slice(0, 4);

  // Screen-reader announcement for the newest reconciliation. The string only changes when a new top
  // event arrives, so aria-live fires once per real payment (not on every 2s poll).
  const top = events[0];
  const liveMsg = top
    ? `${top.customer} ${top.outcome === "quarantine" ? "sent an unmatched payment of" : top.outcome} ${NGN(top.amount)}${top.invoiceId ? `, invoice ${top.invoiceId}` : ""}.`
    : "";

  return (
    <main>
      <div>
        <h1 className="h1">Live collections</h1>
        <p className="sub">Money lands → matched by virtual-account reference → reconciled automatically. Nothing here is typed by hand.</p>
      </div>

      {error && <div className="banner err" role="alert">⚠ Lost connection to the ledger — retrying…</div>}
      <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>

      <div className="grid2">
        <div className="feed">
          <div className="fh">
            <span className="live"><i />LIVE</span>
            <span style={{ color: "var(--faint)", fontSize: 12, fontFamily: "var(--mono)" }}>payment_success webhooks</span>
          </div>
          {events.map((e) => {
            const isFlash = flashId === (e.invoiceId ?? e.id);
            const isWin = isFlash && (e.outcome === "paid" || e.outcome === "overpaid");
            return (
            <div className={`event ${isFlash ? "flash" : ""} ${isWin ? "win" : ""}`} key={e.id}>
              <div className="ic" style={{ background: evBg[e.outcome] }}>{eventIcon(e.outcome)}</div>
              <div>
                <div className="who-line">{e.customer} <span style={{ color: "var(--faint)", fontWeight: 500 }}>→ {e.invoiceId ?? "no match"}</span></div>
                <div className="meta">{e.bankName} · <span className="mono">{e.narration}</span></div>
              </div>
              <div className="amt">{NGN(e.amount)} <Chip status={e.outcome} /><small>{timeAgo(e.time)}</small></div>
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
              <span>When a customer transfers into an invoice&apos;s virtual account, it lands here and reconciles itself. Use the Simulate panel to see it live.</span>
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
              <div className="outrow" key={i.id}><span>{shortName(i.customer)}</span><b className="naira">{NGN(i.amount - i.paid)}</b></div>
            ))}
            {outstanding.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13 }}>All settled 🎉</div>}
          </div>
        </div>
      </div>

      <SimPanel invoices={invoices} simulate={simulate} sync={sync} reverseLast={reverseLast} />
    </main>
  );
}
