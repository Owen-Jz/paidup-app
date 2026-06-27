import { NextResponse } from "next/server";
import { listInvoices, listQuarantine } from "@/lib/store";
import { snapshot, aiSummary } from "@/lib/summary";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// On-demand AI reconciliation brief (operator clicks "Generate brief"). Off the 2s poll so it doesn't
// re-bill. Always returns a usable summary — MiniMax over the computed snapshot, or the deterministic
// templated brief if AI is unavailable. The model only sees pre-computed figures (can't invent money).
export async function POST() {
  const snap = snapshot(listInvoices(), listQuarantine());
  const { summary, source } = await aiSummary(snap);
  return NextResponse.json({ summary, source, aiAvailable: aiConfigured() });
}
