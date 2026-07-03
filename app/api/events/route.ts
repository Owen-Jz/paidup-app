import { NextResponse } from "next/server";
import { listEvents, listInvoices, listQuarantine } from "@/lib/store";
import { bestMatch } from "@/lib/resolver";
import { scanAnomalies } from "@/lib/anomaly";

export const dynamic = "force-dynamic";

// Polled by the dashboard (~2s) to drive the live feed + invoice table without a websocket.
export async function GET() {
  const invoices = listInvoices();
  const invoiced = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + Math.min(i.paid, i.amount), 0)
    + invoices.filter((i) => i.status === "overpaid").reduce((a, i) => a + (i.paid - i.amount), 0);
  const outstanding = invoices.reduce((a, i) => a + Math.max(i.amount - i.paid, 0), 0);
  const events = listEvents(20);
  const rawQuarantine = listQuarantine();
  // Attach the smart-resolver's best guess to each unmatched payment so the UI can offer 1-click assign.
  const quarantine = rawQuarantine.map((e) => ({ ...e, suggestion: bestMatch(e, invoices) }));
  const anomalies = scanAnomalies(invoices, rawQuarantine);
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
