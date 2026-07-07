"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Invoice, FeedEvent, PaymentOutcome } from "@/lib/types";
import type { MatchSuggestion } from "@/lib/resolver";
import type { Anomaly } from "@/lib/anomaly";
import { NGN, STATUS_LABEL, STATUS_CLASS, timeAgo } from "@/lib/format";

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
      if (r.status === 401) {
        // Session expired (8h TTL) — this isn't a network problem, so don't show the retry banner.
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
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

// The reconciliation backstop, automated. Webhooks are not guaranteed delivery (Nomba retries 5×
// then gives up), so the dashboard silently requeries Nomba on load and every 5 minutes, repairing
// the ledger if anything was missed — idempotent, so it can only fill holes, never double-credit.
// Rendered as a quiet status note in the main flow ("Last synced …"), not an ops button.
const SYNC_EVERY_MS = 5 * 60_000;

export function SyncStatus({ sync }: {
  sync: () => Promise<{ configured: boolean; applied?: number; duplicates?: number; scanned?: number; message?: string; balance?: { amount: number; currency: string } } | null>;
}) {
  const [state, setState] = useState<"syncing" | "ok" | "off" | "err">("syncing");
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [recovered, setRecovered] = useState(0);
  // Operator-only ground truth: the Nomba sub-account balance (where every VA credit sweeps).
  const [balance, setBalance] = useState<number | null>(null);
  const [, setTick] = useState(0); // re-render so "Xm ago" stays honest
  // `sync` is recreated on every poll render — hold it in a ref so the schedule effect can be
  // mount-only (otherwise each 2s poll would reset the interval and re-fire a sync).
  const syncRef = useRef(sync);
  useEffect(() => { syncRef.current = sync; });
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("syncing");
    try {
      const res = await syncRef.current();
      if (!res) setState("err");
      else if (!res.configured) setState("off");
      else {
        setLastAt(Date.now());
        setRecovered(res.applied ?? 0);
        if (res.balance && Number.isFinite(res.balance.amount)) setBalance(res.balance.amount);
        setState("ok");
      }
    } catch {
      setState("err");
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    run();
    const iv = setInterval(run, SYNC_EVERY_MS);
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => { clearInterval(iv); clearInterval(tick); };
  }, [run]);

  const ago = lastAt ? timeAgo(new Date(lastAt).toISOString()) : null;
  const linkStyle = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    font: "inherit", color: "inherit", textDecoration: "underline",
  } as const;

  return (
    <span className="mono" style={{ fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap" }} role="status">
      {state === "syncing" && <>⟳ syncing with Nomba…</>}
      {state === "ok" && (
        <>
          ✓ last synced {ago}
          {balance != null && <span title="Live Nomba sub-account balance — the settled cash every virtual-account credit sweeps into"> · {NGN(balance)} settled at Nomba</span>}
          {recovered > 0 && <span style={{ color: "var(--paid)" }}> · recovered {recovered} missed credit{recovered > 1 ? "s" : ""}</span>}
          {" "}<button style={linkStyle} onClick={run} title="Requery Nomba now (idempotent — can only repair, never double-credit)">sync now</button>
        </>
      )}
      {state === "err" && <>⚠ sync failed <button style={linkStyle} onClick={run}>retry</button></>}
      {state === "off" && <>sync off — Nomba creds not set</>}
    </span>
  );
}
