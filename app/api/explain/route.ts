import { NextResponse } from "next/server";
import { listInvoices, listQuarantine } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { scanAnomalies, explainAnomalies } from "@/lib/anomaly";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// On-demand AI explanations for the current anomaly flags (operator clicks "Explain with AI").
// Kept off the 2s poll so it doesn't re-bill MiniMax. Re-scans from live ledger state so the flags
// returned here match what scanAnomalies produced on the poll; each carries an optional AI
// `recommendation`. Falls back to bare flags (no recommendation) when AI is unavailable.
export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const anomalies = scanAnomalies(await listInvoices(session.tid), await listQuarantine(session.tid));
  const explained = await explainAnomalies(anomalies);
  return NextResponse.json({ anomalies: explained, aiAvailable: aiConfigured() });
}
