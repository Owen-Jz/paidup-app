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

  return NextResponse.json({
    invoices,
    events,
    quarantine,
    anomalies,
    kpis: { invoiced, collected, outstanding, attention, rate: invoiced ? Math.round((collected / invoiced) * 100) : 0 },
  });
}
