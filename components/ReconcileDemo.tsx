"use client";

import { useState } from "react";

/**
 * Hero widget — the reconciliation engine, made legible at a glance. Three invoices, the three
 * outcomes the engine produces from an incoming transfer:
 *   • Paid        — exact settlement, full bar.
 *   • Partial     — some received, balance still due (₦28,000 of ₦70,000).
 *   • Refundable  — customer overpaid; the surplus is refundable in one tap.
 *
 * Progressive: the reconciled states + figures render server-side (readable with zero JS). On the
 * client the bars sweep in, "Replay" re-runs the sweep, and the Refundable row's one-tap refund
 * settles the surplus live. Reduced-motion collapses every animation to its final frame.
 */

type Inv = { id: string; who: string; acct: string; amount: number; paid: number };

const FINAL: Inv[] = [
  { id: "INV-1042", who: "Dangote Cement", acct: "3049420327", amount: 450000, paid: 450000 },   // Paid
  { id: "INV-1043", who: "Jumia Nigeria", acct: "9882319033", amount: 70000, paid: 28000 },       // Partial
  { id: "INV-1046", who: "MTN Nigeria", acct: "5521190044", amount: 1300000, paid: 1400000 },      // Refundable
];

// Deterministic grouping (avoids SSR/client ICU differences → no hydration mismatch).
const ngn = (n: number) => "₦" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function statusOf(i: Inv): { label: string; cls: string } {
  if (i.paid === 0) return { label: "Awaiting", cls: "c-awaiting" };
  if (i.paid > i.amount) return { label: "Refundable", cls: "c-overpaid" };
  if (i.paid >= i.amount) return { label: "Paid", cls: "c-paid" };
  return { label: "Partial", cls: "c-partial" };
}

export function ReconcileDemo() {
  const [inv, setInv] = useState<Inv[]>(FINAL);
  const [replayKey, setReplayKey] = useState(0);
  const [refunded, setRefunded] = useState(false);

  const replay = () => {
    setInv(FINAL);
    setRefunded(false);
    setReplayKey((k) => k + 1);
  };
  const refund = () => {
    setInv((prev) => prev.map((i) => (i.paid > i.amount ? { ...i, paid: i.amount } : i)));
    setRefunded(true);
  };

  return (
    <div className="demo">
      <div className="demo-head">
        <span className="demo-title serif">Your invoices</span>
        <span className="demo-head-r">
          <span className="demo-live"><i />live</span>
          <button className="demo-replay" type="button" onClick={replay}>↺ Replay</button>
        </span>
      </div>

      <div className="demo-invoices">
        {inv.map((i) => {
          const st = statusOf(i);
          const over = i.paid > i.amount;
          const due = i.amount - i.paid;
          // When overpaid, the track represents the full amount RECEIVED so the surplus shows as an
          // amber tip beyond the green "settled" segment; otherwise the green fill is paid/amount.
          const greenPct = over ? (i.amount / i.paid) * 100 : Math.min((i.paid / i.amount) * 100, 100);
          const amberPct = over ? ((i.paid - i.amount) / i.paid) * 100 : 0;
          return (
            <div className="demo-inv" data-inv={i.id} key={i.id}>
              <div className="demo-inv-top">
                <div className="demo-inv-l">
                  <b className="mono">{i.id}</b>
                  <small>{i.who} · <span className="mono">{i.acct}</span></small>
                </div>
                <div className="demo-inv-r">
                  <span className="naira demo-amt">{ngn(i.amount)}</span>
                  <span className={`chip demo-chip ${st.cls}`} key={`${replayKey}-${st.cls}`}><span className="dot" />{st.label}</span>
                </div>
              </div>

              <div className="demo-bar">
                <i className="demo-seg green" key={`g-${replayKey}-${i.id}`} style={{ width: `${greenPct}%` }} />
                {over && <i className="demo-seg amber" key={`a-${replayKey}-${i.id}`} style={{ width: `${amberPct}%` }} />}
              </div>

              <div className="demo-inv-foot mono">
                <span>
                  {over ? (
                    <>Received {ngn(i.paid)} · <b className="over">{ngn(i.paid - i.amount)} over</b></>
                  ) : i.paid >= i.amount ? (
                    <>Fully paid</>
                  ) : (
                    <>{ngn(i.paid)} of {ngn(i.amount)} · <b className="due">{ngn(due)} due</b></>
                  )}
                </span>
                {over && !refunded && (
                  <button className="demo-refund" type="button" onClick={refund}>↩ Refund {ngn(i.paid - i.amount)}</button>
                )}
                {over && refunded && <span className="demo-refunded">✓ Surplus refunded</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="demo-foot">
        <span className="demo-foot-lab">Paid · Partial · Refundable — every transfer matched by its virtual-account reference. Nothing typed by hand.</span>
      </div>
    </div>
  );
}
