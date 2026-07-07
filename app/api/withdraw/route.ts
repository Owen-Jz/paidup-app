import { NextRequest, NextResponse } from "next/server";
import { DEMO_TENANT_ID, listWithdrawals, recordWithdrawal, reserveWithdrawalAtomic, tenantWithdrawable, updateWithdrawalStatus } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { getSubAccountBalance, listBanks, lookupBankAccount, nombaConfigured, transferToBank } from "@/lib/nomba";
import { parseJsonBody, posAmount, reqString } from "@/lib/validate";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Withdraw settled collections to the merchant's own bank account.
// The Nomba sub-account is GLOBAL (every tenant's VA credits sweep into the one hackathon
// sub-account), so what a tenant may withdraw is min(its ledger net-collections, the REAL pot).
// Money-safety flow: reserve (write-ahead record) BEFORE the transfer, then reconcile the
// record to the transfer's real outcome — so a settled payout can never be reported as failed
// and left withdrawable again.

const isOperator = (tid: string) => tid === DEMO_TENANT_ID;

// Bank list rarely changes — cache it for the process lifetime.
let bankCache: Array<{ code: string; name: string }> | null = null;

// The true amount a tenant can withdraw RIGHT NOW: never more than their ledger net-collections,
// and never more than the real cash actually settled in the shared Nomba pot.
async function realWithdrawable(tid: string): Promise<{ amount: number; pot: number | null }> {
  const ledger = await tenantWithdrawable(tid);
  if (!nombaConfigured()) return { amount: ledger, pot: null };
  try {
    const bal = await getSubAccountBalance();
    return { amount: Math.min(ledger, bal.amount), pot: bal.amount };
  } catch {
    // Pot unreadable → fall back to the ledger figure; the POST still hard-checks the pot before sending.
    return { amount: ledger, pot: null };
  }
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (nombaConfigured()) {
    try { bankCache = bankCache ?? await listBanks(); } catch { /* picker degrades to code input */ }
  }
  const { amount, pot } = await realWithdrawable(session.tid);
  return NextResponse.json({
    operator: isOperator(session.tid), configured: nombaConfigured(),
    // Only the operator sees the global pot figure (sharing it leaks other tenants' totals).
    balance: isOperator(session.tid) && pot != null ? { amount: pot, currency: "NGN" } : null,
    withdrawable: amount,
    banks: bankCache ?? [], withdrawals: await listWithdrawals(session.tid),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Defense-in-depth against a burst of concurrent payouts. Keyed on the SESSION tenant (not a
  // spoofable header), so it can't be rotated away — bounds how fast one workspace can fire payouts.
  const rl = rateLimit(`withdraw:${session.tid}`, { limit: 8, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "too many withdrawal attempts — wait a moment" }, { status: 429 });
  }
  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as { ref?: unknown; amount?: unknown; bankCode?: unknown; accountNumber?: unknown };

  const refR = reqString(body.ref, "ref", 64);
  if (!refR.ok) return NextResponse.json({ error: refR.error }, { status: 400 });
  const amountR = posAmount(body.amount);
  if (!amountR.ok) return NextResponse.json({ error: amountR.error }, { status: 400 });
  const bankR = reqString(body.bankCode, "bankCode", 10);
  if (!bankR.ok) return NextResponse.json({ error: bankR.error }, { status: 400 });
  const acctR = reqString(body.accountNumber, "accountNumber", 10);
  if (!acctR.ok) return NextResponse.json({ error: acctR.error }, { status: 400 });
  if (!/^\d{10}$/.test(acctR.value)) {
    return NextResponse.json({ error: "accountNumber must be a 10-digit NUBAN" }, { status: 400 });
  }
  const amount = amountR.value;

  const id = `wd_${refR.value}`;

  // Idempotency FIRST: a replayed ref returns the ORIGINAL record — no re-validation, no second
  // transfer, no second Nomba call. Whatever state it's in (pending/settled/failed) is the truth.
  const prior = (await listWithdrawals(session.tid)).find((w) => w.id === id);
  if (prior) {
    return NextResponse.json({
      ok: prior.status !== "failed", withdrawal: prior, live: prior.live,
      status: prior.status, replayed: true,
      ...(prior.status === "failed" ? { error: "this payout previously failed — start a new one" } : {}),
    }, { status: prior.status === "failed" ? 409 : 200 });
  }

  // Ceiling = min(ledger net-collections, real pot). Reserves already subtract pending+settled.
  const { amount: ceiling, pot } = await realWithdrawable(session.tid);
  if (nombaConfigured() && pot == null) {
    return NextResponse.json({ error: "could not confirm settled balance — try again in a moment" }, { status: 502 });
  }
  if (amount > ceiling) {
    return NextResponse.json({ error: `amount exceeds what's available to withdraw (₦${ceiling})` }, { status: 400 });
  }

  // Demo = dev build, or prod with DEMO_MODE=1, or WITHDRAW_LIVE unset. CRITICAL: demo NEVER
  // calls transferToBank — production creds may be present on a dev machine, and a "demo" that
  // fires a real transfer is how money leaves for real. WITHDRAW_LIVE=1 is the explicit opt-in
  // for real payouts (the demo-workspace password is PUBLISHED, so live payout must be armed).
  const demo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1"
    || process.env.WITHDRAW_LIVE !== "1";

  // Bank-confirm the recipient name (read-only) BEFORE committing anything. A lookup failure here
  // is provably pre-transfer, so we can safely reject with nothing recorded.
  let accountName = "";
  if (nombaConfigured()) {
    try {
      accountName = (await lookupBankAccount(acctR.value, bankR.value)).accountName;
    } catch {
      return NextResponse.json({ error: "couldn't confirm that account — check the bank and number" }, { status: 422 });
    }
  }

  if (demo) {
    // No money moves. Record a settled DEMO entry (live:false) so history + balance stay realistic.
    const withdrawal = await recordWithdrawal({
      id, tenantId: session.tid, amount, bankCode: bankR.value, accountNumber: acctR.value,
      accountName: accountName || "(demo)", narration: "PaidUp payout (demo — no live transfer)",
      status: "settled", live: false,
    });
    return NextResponse.json({ ok: true, withdrawal, live: false, status: "settled", demo: true });
  }

  // ── LIVE PATH ── ATOMIC check-and-reserve (now DB-enforced) ─────────────────────────────────
  // Recompute the ceiling and write the reserving `pending` record inside ONE Mongo transaction,
  // serialized per-tenant by a write-lock, so two concurrent DISTINCT-ref POSTs can't both pass the
  // check before either reserves (the TOCTOU that would double-spend the shared pot). This is now
  // multi-instance safe — the whole reason for the DB migration — not just a single-process trick.
  const reserved = await reserveWithdrawalAtomic(
    { id, tenantId: session.tid, amount, bankCode: bankR.value, accountNumber: acctR.value, accountName, narration: "PaidUp payout of settled collections" },
    pot,
  );
  if (!reserved.ok) {
    return NextResponse.json({ error: `amount exceeds what's available to withdraw (₦${reserved.cap})` }, { status: 400 });
  }

  // 2) Attempt the transfer. Idempotency key = the ref, so a retried call Nomba-dedupes.
  try {
    await transferToBank({
      amount, accountNumber: acctR.value, accountName, bankCode: bankR.value,
      narration: "PaidUp payout of settled collections", idempotencyKey: `withdraw_${refR.value}`,
    });
    // 3a) Confirmed SUCCESS → settle the reserved record.
    const withdrawal = await updateWithdrawalStatus(id, "settled", { live: true, tenantId: session.tid });
    return NextResponse.json({ ok: true, withdrawal, live: true, status: "settled" });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // 3b) PROVABLE pre-debit rejection (Nomba `REFUND` = failed + auto-refunded) → free the reserve.
    //     ONLY these definite-no-money cases mark `failed`; anything else stays `pending`.
    if (/\bREFUND\b/.test(msg)) {
      await updateWithdrawalStatus(id, "failed", { tenantId: session.tid });
      return NextResponse.json({ error: "the bank rejected this transfer — nothing was sent, try again" }, { status: 502 });
    }
    // 3c) AMBIGUOUS (PENDING_BILLING, timeout, unknown status): money may well have moved. Keep it
    //     RESERVED as pending — never tell the user "nothing sent", and let sync confirm later.
    const withdrawal = await updateWithdrawalStatus(id, "pending", { tenantId: session.tid });
    return NextResponse.json({
      ok: true, withdrawal, live: false, status: "pending", pending: true,
      note: "Payout is in flight — it will confirm shortly. The amount stays reserved so it can't be sent twice.",
    });
  }
}
