import { NextRequest, NextResponse } from "next/server";
import { getEvent, listInvoices } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { aiResolve } from "@/lib/resolver";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

// On-demand AI resolve for ONE unmatched payment (triggered by the operator clicking "Ask AI").
// Kept off the 2s poll so it doesn't re-bill MiniMax. Always returns a suggestion (AI or heuristic
// fallback) or null — the money is never moved here; the operator still confirms with one click.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let transactionId: string | undefined;
  try {
    ({ transactionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!transactionId) return NextResponse.json({ error: "transactionId required" }, { status: 400 });

  const event = getEvent(transactionId);
  if (!event || event.outcome !== "quarantine" || event.tenantId !== session.tid) {
    return NextResponse.json({ error: "no such unmatched payment" }, { status: 404 });
  }

  // Candidate invoices come only from the caller's workspace — AI never sees another tenant's ledger.
  const suggestion = await aiResolve(event, listInvoices(session.tid));
  return NextResponse.json({ suggestion, aiAvailable: aiConfigured() });
}
