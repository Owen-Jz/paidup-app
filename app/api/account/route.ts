import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_TTL_SEC, sessionSecret, signSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { requireSession } from "@/lib/session";
import {
  DEMO_TENANT_ID, changePassword, clearWorkspaceData, deleteAccount,
  listEvents, listInvoices, listWithdrawals, updateBusinessName,
} from "@/lib/store";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { oneOf, parseJsonBody, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Sensitive-action budget per client IP (password re-verification lives behind this, same shape as
// the login brute-force budget): 8 attempts / 15 min.
const LIMIT = 8;
const WINDOW_MS = 15 * 60 * 1000;

const WIPE_MESSAGES: Record<string, { status: number; error: string }> = {
  demo_workspace: { status: 403, error: "The shared demo workspace can't be cleared or deleted." },
  payout_in_flight: { status: 409, error: "A payout is still in flight — wait for it to settle (or fail) before erasing the ledger, so money mid-air is never orphaned." },
  not_found: { status: 404, error: "workspace not found" },
};

/** Profile + workspace summary for the settings page. */
export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [invoices, events, withdrawals] = await Promise.all([
    listInvoices(session.tid), listEvents(1000, session.tid), listWithdrawals(session.tid),
  ]);
  return NextResponse.json({
    email: session.user.email,
    businessName: session.tenant.businessName,
    createdAt: session.tenant.createdAt,
    demo: session.tid === DEMO_TENANT_ID,
    counts: {
      invoices: invoices.length,
      events: events.length,
      withdrawals: withdrawals.length,
      pendingPayouts: withdrawals.filter((w) => w.status === "pending").length,
    },
  });
}

/** Settings mutations: rename workspace · change password · clear workspace data. */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.data as Record<string, unknown>;
  const actionR = oneOf(body.action, ["rename", "password", "clear-data"] as const, "action");
  if (!actionR.ok) return NextResponse.json({ error: actionR.error }, { status: 400 });

  if (actionR.value === "rename") {
    const nameR = reqString(body.businessName, "businessName", 80);
    if (!nameR.ok) return NextResponse.json({ error: nameR.error }, { status: 400 });
    if (nameR.value.length < 2) return NextResponse.json({ error: "businessName is too short" }, { status: 400 });
    const tenant = await updateBusinessName(session.tid, nameR.value);
    if (!tenant) return NextResponse.json({ error: "workspace not found" }, { status: 404 });
    return NextResponse.json({ ok: true, businessName: tenant.businessName });
  }

  if (actionR.value === "password") {
    // Rate-limit BEFORE any scrypt work — this endpoint verifies a password, so it gets the same
    // brute-force budget as login.
    const rl = rateLimit(`account:${clientIp(req)}`, { limit: LIMIT, windowMs: WINDOW_MS });
    if (!rl.allowed) return NextResponse.json({ error: "too many attempts, try again later" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    const curR = reqString(body.currentPassword, "currentPassword", 200);
    if (!curR.ok) return NextResponse.json({ error: curR.error }, { status: 400 });
    const newR = reqString(body.newPassword, "newPassword", 200);
    if (!newR.ok) return NextResponse.json({ error: newR.error }, { status: 400 });
    if (newR.value.length < 8) return NextResponse.json({ error: "new password must be at least 8 characters" }, { status: 400 });
    if (!verifyPassword(curR.value, session.user.passwordHash)) {
      return NextResponse.json({ error: "current password is incorrect" }, { status: 401 });
    }
    const user = await changePassword(session.user.id, hashPassword(newR.value));
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
    // tokenVersion just bumped — every other session is dead. Re-mint THIS one so the operator
    // changing their password stays signed in.
    const secret = sessionSecret();
    const res = NextResponse.json({ ok: true });
    if (secret) {
      const token = await signSession(
        { uid: user.id, tid: user.tenantId, ver: user.tokenVersion, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC },
        secret,
      );
      res.cookies.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SEC, secure: process.env.NODE_ENV === "production" });
    }
    return res;
  }

  // clear-data — destructive; the typed confirmation is checked server-side, not just in the UI.
  const confirmR = reqString(body.confirm, "confirm", 254);
  if (!confirmR.ok || confirmR.value.trim().toLowerCase() !== session.user.email) {
    return NextResponse.json({ error: "type your account email to confirm" }, { status: 400 });
  }
  const result = await clearWorkspaceData(session.tid);
  if (!result.ok) {
    const m = WIPE_MESSAGES[result.reason];
    return NextResponse.json({ error: m.error }, { status: m.status });
  }
  return NextResponse.json({ ok: true, removed: result.removed });
}

/** Delete the account entirely. Requires the password (not just a click), clears the session. */
export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`account:${clientIp(req)}`, { limit: LIMIT, windowMs: WINDOW_MS });
  if (!rl.allowed) return NextResponse.json({ error: "too many attempts, try again later" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const parsed = parseJsonBody(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const passR = reqString((parsed.data as Record<string, unknown>).password, "password", 200);
  if (!passR.ok) return NextResponse.json({ error: passR.error }, { status: 400 });
  if (!verifyPassword(passR.value, session.user.passwordHash)) {
    return NextResponse.json({ error: "password is incorrect" }, { status: 401 });
  }

  const result = await deleteAccount(session.tid);
  if (!result.ok) {
    const m = WIPE_MESSAGES[result.reason];
    return NextResponse.json({ error: m.error }, { status: m.status });
  }
  const res = NextResponse.json({ ok: true, removed: result.removed });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
