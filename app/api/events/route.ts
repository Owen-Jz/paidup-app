import { NextResponse } from "next/server";
import { listEvents, listInvoices, listQuarantine, acknowledgedFlagKeys } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { bestMatch } from "@/lib/resolver";
import { scanAnomalies, type Anomaly } from "@/lib/anomaly";
import type { Invoice, FeedEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// The anomaly scan is the one O(n²) computation on this endpoint. Every dashboard polls ~2s, so
// N open tabs would each re-scan the whole ledger 30×/min. The live feed and KPIs stay real-time
// (recomputed every poll — they're cheap O(n)); only the ADVISORY fraud flags are memoized per
// tenant for a few seconds. A newly-tripped flag surfaces within ANOMALY_TTL_MS, which is fine for
// a "take a look" signal (and operator dismissals still apply instantly — the acked filter runs
// live on the cached scan, below).
const ANOMALY_TTL_MS = Number(process.env.ANOMALY_TTL_MS || 8_000);
const anomalyCache = new Map<string, { at: number; anomalies: Anomaly[] }>();

function cachedAnomalies(tenantId: string, invoices: Invoice[], quarantine: FeedEvent[]): Anomaly[] {
  const now = Date.now();
  const hit = anomalyCache.get(tenantId);
  if (hit && now - hit.at < ANOMALY_TTL_MS) return hit.anomalies;
  const anomalies = scanAnomalies(invoices, quarantine);
  anomalyCache.set(tenantId, { at: now, anomalies });
  return anomalies;
}

// Polled by the dashboard (~2s) to drive the live feed + invoice table without a websocket.
// Tenant-scoped: only the logged-in workspace's ledger, ever.
export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const invoices = await listInvoices(session.tid);
  const invoiced = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0)
    + invoices.filter((i) => i.status === "overpaid").reduce((a, i) => a + (i.paid - i.amount), 0);
  const outstanding = invoices.reduce((a, i) => a + Math.max(i.amount - i.paid, 0), 0);
  const events = await listEvents(20, session.tid);
  const rawQuarantine = await listQuarantine(session.tid);
  // Attach the smart-resolver's best guess to each unmatched payment so the UI can offer 1-click assign.
  const quarantine = rawQuarantine.map((e) => ({ ...e, suggestion: bestMatch(e, invoices) }));
  // Drop flags the operator has already reviewed/confirmed so they don't resurface every poll.
  const acked = await acknowledgedFlagKeys(session.tid);
  const anomalies = cachedAnomalies(session.tid, invoices, rawQuarantine).filter((a) => !acked.has(a.key));
  const attention = invoices.filter((i) => i.status === "overpaid").length + quarantine.length;

  // The polled feed doesn't need raw payer bank details — mask them to last-4 so this endpoint
  // never leaks full account numbers (bounce/refund read the real values server-side, not from here).
  const maskAcct = (n?: string) => (n ? "••••" + n.slice(-4) : n);
  const maskEvent = <T extends { senderAccountNumber?: string }>(e: T): T => ({ ...e, senderAccountNumber: maskAcct(e.senderAccountNumber) });
  const safeInvoices = invoices.map((i) => ({ ...i, payments: i.payments.map(maskEvent) }));

  return NextResponse.json({
    invoices: safeInvoices,
    events: events.map(maskEvent),
    quarantine: quarantine.map(maskEvent),
    anomalies,
    kpis: { invoiced, collected, outstanding, attention, rate: invoiced ? Math.round((collected / invoiced) * 100) : 0 },
  });
}
