"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Invoice, FeedEvent, PaymentOutcome } from "@/lib/types";
import type { MatchSuggestion } from "@/lib/resolver";
import type { Anomaly } from "@/lib/anomaly";
import { NGN, STATUS_LABEL, STATUS_CLASS } from "@/lib/format";

export type QuarantineItem = FeedEvent & { suggestion: MatchSuggestion | null };
export type { Anomaly };
export interface Kpis { invoiced: number; collected: number; outstanding: number; attention: number; rate: number; }
export interface DashboardData { invoices: Invoice[]; events: FeedEvent[]; quarantine: QuarantineItem[]; anomalies: Anomaly[]; kpis: Kpis; }

const EMPTY: DashboardData = { invoices: [], events: [], quarantine: [], anomalies: [], kpis: { invoiced: 0, collected: 0, outstanding: 0, attention: 0, rate: 0 } };

export function useDashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastTop = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/events", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d: DashboardData = await r.json();
      const top = d.events[0]?.id ?? null;
      if (top && lastTop.current && top !== lastTop.current) {
        const ev = d.events[0];
        setFlashId(ev.invoiceId ?? ev.id);
        setTimeout(() => setFlashId(null), 1700);
      }
      lastTop.current = top;
      setData(d);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const simulate = useCallback(async (invoiceRef: string | null, amount: number) => {
    const r = await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceRef, amount }),
    });
    await refresh();
    return r.ok;
  }, [refresh]);

  const reverseLast = useCallback(async (invoiceRef: string) => {
    const r = await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "reversal", invoiceRef }),
    });
    await refresh();
    return r.ok;
  }, [refresh]);

  const refund = useCallback(async (invoiceId: string) => {
    const r = await fetch("/api/refund", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    await refresh();
    return r.ok ? r.json() : null;
  }, [refresh]);

  const sync = useCallback(async () => {
    const r = await fetch("/api/sync", { method: "POST" });
    await refresh();
    return r.ok ? r.json() : null;
  }, [refresh]);

  const resolveQuarantine = useCallback(async (transactionId: string, invoiceId: string) => {
    const r = await fetch("/api/quarantine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", transactionId, invoiceId }),
    });
    await refresh();
    return r.ok ? r.json() : null;
  }, [refresh]);

  const bounceQuarantine = useCallback(async (transactionId: string) => {
    const r = await fetch("/api/quarantine", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bounce", transactionId }),
    });
    await refresh();
    return r.ok ? r.json() : null;
  }, [refresh]);

  return { ...data, flashId, loading, error, refresh, simulate, reverseLast, refund, sync, resolveQuarantine, bounceQuarantine };
}

/**
 * Animated integer count-up. Eases from the previous value to the new one (easeOutCubic) only when the
 * value actually changes, so it animates on first paint and on each real reconciliation — never on the
 * idle 2s poll. Honors prefers-reduced-motion by jumping straight to the target.
 */
export function CountUp({ value, suffix = "", duration = 900 }: { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) { setDisplay(to); fromRef.current = to; return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}{suffix}</>;
}

export function Chip({ status }: { status: PaymentOutcome | Invoice["status"] }) {
  return (
    <span className={`chip ${STATUS_CLASS[status]}`}>
      <span className="dot" />{STATUS_LABEL[status]}
    </span>
  );
}

// The simulate-payment panel is retired: with production credentials wired, payments come from
// real bank transfers (or the signed-webhook script for scripted demos — scripts/send-signed-webhook.mjs).
// What remains is the judged RELIABILITY feature: the requery backstop.
export function SyncPanel({ sync }: {
  sync: () => Promise<{ configured: boolean; applied?: number; duplicates?: number; scanned?: number; message?: string } | null>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await sync();
      if (!res) setSyncMsg("Sync failed — check server logs.");
      else if (!res.configured) setSyncMsg("Live-only: set Nomba creds to sync.");
      else setSyncMsg(`Reconciled ${res.scanned ?? 0} credit(s): ${res.applied ?? 0} applied · ${res.duplicates ?? 0} already seen.`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sim">
      <h5>🔄 Reconciliation backstop</h5>
      <div className="body">
        <div className="sync-row" style={{ marginTop: 0 }}>
          <button className="btn sync" onClick={runSync} disabled={syncing}>
            {syncing ? "⟳ Reconciling…" : "🔄 Sync from Nomba"}
          </button>
          <div className="hint">Re-pulls credits from Nomba and repairs the ledger if a webhook was ever missed. Idempotent — safe to run anytime.</div>
          {syncMsg && <div className="sync-msg mono">{syncMsg}</div>}
        </div>
      </div>
    </div>
  );
}
