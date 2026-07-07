import { NextRequest, NextResponse } from "next/server";
import { getEvent, listInvoices } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { aiResolve } from "@/lib/resolver";
import { aiConfigured } from "@/lib/ai";
import { parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// On-demand AI resolve for ONE unmatched payment (triggered by the operator clicking "Ask AI").
// Kept off the 2s poll so it doesn't re-bill MiniMax. Always returns a suggestion (AI or heuristic
// fallback) or null — the money is never moved here; the operator still confirms with one click.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Size-capped, type-checked body like every other POST (was the only one bypassing MAX_BODY_BYTES).
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const idR = reqString((parsed.data as { transactionId?: unknown }).transactionId, "transactionId", 80);
  if (!idR.ok) return NextResponse.json({ error: idR.error }, { status: 400 });
  const transactionId = idR.value;

  const event = await getEvent(transactionId);
  if (!event || event.outcome !== "quarantine" || event.tenantId !== session.tid) {
    return NextResponse.json({ error: "no such unmatched payment" }, { status: 404 });
  }

  // Candidate invoices come only from the caller's workspace — AI never sees another tenant's ledger.
  const suggestion = await aiResolve(event, await listInvoices(session.tid));
  return NextResponse.json({ suggestion, aiAvailable: aiConfigured() });
}
