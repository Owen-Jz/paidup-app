import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { findTenantPayment } from "@/lib/store";
import { requery } from "@/lib/nomba";
import { parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Verify a payment against Nomba's bank-network record. Tenant-scoped + read-only: it can only look up
// a payment that belongs to the caller's workspace, and it never mutates the ledger.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const txR = reqString((parsed.data as { transactionId?: unknown }).transactionId, "transactionId", 120);
  if (!txR.ok) return NextResponse.json({ error: txR.error }, { status: 400 });

  const p = await findTenantPayment(session.tid, txR.value);
  if (!p) return NextResponse.json({ error: "payment not found in your workspace" }, { status: 404 });
  if (!p.sessionId) return NextResponse.json({ error: "this payment has no bank sessionId to requery", ledger: p }, { status: 422 });

  try {
    const nomba = await requery(p.sessionId);
    return NextResponse.json({ ledger: p, nomba });
  } catch (e) {
    console.error("[requery] failed:", e);
    return NextResponse.json({ error: "could not reach the bank network — try again shortly", ledger: p }, { status: 502 });
  }
}
