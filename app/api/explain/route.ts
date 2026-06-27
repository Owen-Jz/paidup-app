import { NextResponse } from "next/server";
import { listInvoices, listQuarantine } from "@/lib/store";
import { scanAnomalies, explainAnomalies } from "@/lib/anomaly";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// On-demand AI explanations for the current anomaly flags (operator clicks "Explain with AI").
// Kept off the 2s poll so it doesn't re-bill MiniMax. Re-scans from live ledger state so the flags
// returned here match what scanAnomalies produced on the poll; each carries an optional AI
// `recommendation`. Falls back to bare flags (no recommendation) when AI is unavailable.
export async function POST() {
  const anomalies = scanAnomalies(listInvoices(), listQuarantine());
  const explained = await explainAnomalies(anomalies);
  return NextResponse.json({ anomalies: explained, aiAvailable: aiConfigured() });
}
