import { NextRequest, NextResponse } from "next/server";
import { acknowledgeFlag, unacknowledgeFlag } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { parseJsonBody, reqString, oneOf } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Acknowledge (confirm/dismiss) or re-open an anomaly flag. Tenant-scoped: the key is only ever
// stored/removed against the caller's own workspace, so one tenant can't touch another's flags.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { key?: unknown; action?: unknown };

  const keyR = reqString(body.key, "key", 200);
  if (!keyR.ok) return NextResponse.json({ error: keyR.error }, { status: 400 });
  const actionR = oneOf(body.action, ["ack", "unack"] as const, "action");
  if (!actionR.ok) return NextResponse.json({ error: actionR.error }, { status: 400 });

  if (actionR.value === "ack") acknowledgeFlag(session.tid, keyR.value);
  else unacknowledgeFlag(session.tid, keyR.value);

  return NextResponse.json({ ok: true });
}
