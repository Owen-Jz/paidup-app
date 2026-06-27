import { NextRequest, NextResponse } from "next/server";
import { getEvent, listInvoices } from "@/lib/store";
import { aiResolve } from "@/lib/resolver";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// On-demand AI resolve for ONE unmatched payment (triggered by the operator clicking "Ask AI").
// Kept off the 2s poll so it doesn't re-bill MiniMax. Always returns a suggestion (AI or heuristic
// fallback) or null — the money is never moved here; the operator still confirms with one click.
export async function POST(req: NextRequest) {
  let transactionId: string | undefined;
  try {
    ({ transactionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!transactionId) return NextResponse.json({ error: "transactionId required" }, { status: 400 });

  const event = getEvent(transactionId);
  if (!event || event.outcome !== "quarantine") {
    return NextResponse.json({ error: "no such unmatched payment" }, { status: 404 });
  }

  const suggestion = await aiResolve(event, listInvoices());
  return NextResponse.json({ suggestion, aiAvailable: aiConfigured() });
}
