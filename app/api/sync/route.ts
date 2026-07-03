import { NextResponse } from "next/server";
import { nombaConfigured, getVirtualAccountTransactions } from "@/lib/nomba";
import { applyPayment, listInvoices } from "@/lib/store";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Reconciliation backstop (GAPS #8): pull what Nomba actually recorded and re-run it through
// the SAME dedupe+reconcile path as the webhook. Idempotent — already-seen transactionIds are
// no-ops, so this only repairs the ledger if a webhook was ever missed/dropped. Docs are explicit:
// "never rely on webhooks alone." Targets open invoices (awaiting/partial) — where a missed
// credit actually matters — to keep the API-call count bounded.
export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!nombaConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Nomba creds not set — sync is live-only. Set NOMBA_CLIENT_ID/SECRET/ACCOUNT_ID.",
      scanned: 0, applied: 0, duplicates: 0, quarantined: 0,
    });
  }

  const open = listInvoices(session.tid).filter((i) => i.status === "awaiting" || i.status === "partial");
  let scanned = 0, applied = 0, duplicates = 0, quarantined = 0;
  const errors: string[] = [];

  for (const inv of open) {
    if (!inv.acctNumber) continue;
    try {
      const credits = await getVirtualAccountTransactions(inv.acctNumber, inv.id);
      for (const c of credits) {
        scanned++;
        const r = applyPayment({
          transactionId: c.transactionId,
          aliasAccountReference: c.aliasAccountReference,
          amount: c.amount,
          sender: c.sender,
          senderAccountNumber: c.senderAccountNumber,
          senderBankCode: c.senderBankCode,
          bankName: c.bankName,
          narration: c.narration,
          time: c.time,
          fallbackTenantId: session.tid, // an unmatched credit on this tenant's VA stays theirs
        });
        if (r.outcome === "duplicate") duplicates++;
        else if (r.outcome === "quarantine") quarantined++;
        else applied++;
      }
    } catch (e) {
      // One VA failing must not abort the sweep. Log the detail server-side; return a generic note.
      console.error(`[sync] ${inv.id} fetch failed:`, e);
      errors.push(`${inv.id}: could not fetch transactions`);
    }
  }

  return NextResponse.json({
    configured: true,
    accountsChecked: open.length,
    scanned, applied, duplicates, quarantined,
    ...(errors.length ? { errors } : {}),
  });
}
