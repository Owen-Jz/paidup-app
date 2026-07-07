# Withdraw + Invoice Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four gaps found in review — no way to withdraw collected money, blank bank name on real VAs, invoice text overflowing the printable document, and single-line-only invoice descriptions.

**Architecture:** Withdraw reuses the proven refund plumbing (`lookupBankAccount` → `transferToBank` with a stable idempotency key) behind a new operator-gated `/api/withdraw` route, persisted as a new `withdrawals` collection in the file-backed store with an audit-chain entry. The other three fixes are surgical: a defensive fallback in the Nomba VA mapper, CSS `overflow-wrap` rules, and newline-aware description rendering (no data-model change).

**Tech Stack:** Next.js 14.2 App Router, TypeScript 5.5, `node --test` unit suite, file-backed store (`lib/store.ts`).

## Global Constraints

- **NO git commits or pushes** — user halted commit/push 2026-07-04; all work stays in the working tree until they ask. Every "Commit" step in the usual template is replaced by "leave in working tree".
- `npm test` must stay green (run from repo root; it is `node --test` over `lib/*.test.ts`).
- `npm run build` must stay green — but **never run build while `npm run dev` is up** (corrupts `.next`).
- The money path is sacred: all arithmetic uses `Math.round(x * 100) / 100`; reject NaN/invalid; never mark the ledger moved unless the transfer settled (`transferToBank` throws unless `data.status === "SUCCESS"`).
- Every API route resolves `requireSession()` and scopes to `session.tid`. The sub-account balance is GLOBAL, so withdraw is gated to `session.tid === DEMO_TENANT_ID` (operator workspace) for this MVP.
- Design = "The Ledger": reuse existing classes (`.btn`, `.ghost`, `.modal`, `.kpi`, `mono`, `naira`); tokens are CSS variables in `app/globals.css`; no generic dark-dashboard look.
- Demo semantics mirror `/api/refund`: `demo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1"`; in demo the ledger records the action with `live:false` instead of failing when the transfer can't settle.

---

### Task 1: Bank-name fallback for real Nomba VAs

**Files:**
- Modify: `lib/nomba.ts:100-105` (the `createVirtualAccount` return mapping)

**Interfaces:**
- Produces: unchanged signature `createVirtualAccount(opts): Promise<CreateVAResult>` — but `bankName` is now never empty/undefined.

Context: every UI surface (pay page, invoice PDF, dashboard table, created-modal) renders `invoice.bankName` verbatim. The mock path always sets `"Nombank MFB"`, but the real path maps `j.data.bankName` with no fallback — a production response that omits or renames the field stores `undefined` and renders a blank bank. The reporting mapper (`mapCredit`) is already defensive; make the create mapper match.

- [ ] **Step 1: Apply the defensive mapping**

Replace the return block at `lib/nomba.ts:100-105`:

```ts
  const d = j.data ?? {};
  // Field names drift between environments; map defensively and NEVER store an empty bank —
  // every payer-facing surface renders bankName verbatim. Env override for the real issuer label.
  return {
    accountRef: d.accountRef,
    acctNumber: d.bankAccountNumber ?? d.accountNumber,
    acctName: d.bankAccountName ?? d.accountName ?? opts.accountName,
    bankName: d.bankName ?? d.bank_name ?? process.env.NOMBA_VA_BANK_NAME ?? "Nomba",
  };
```

- [ ] **Step 2: Verify types still compile**

Run: `npx tsc --noEmit`
Expected: exits 0 (same as before the change).

- [ ] **Step 3: Leave in working tree** (no commit — global constraint). Note for later ops: the already-created VPS invoice with a blank bank needs a one-time backfill in its `.data/ledger.json` (set `bankName` on the affected invoice) — VPS-side task, out of scope here.

---

### Task 2: Invoice document overflow CSS

**Files:**
- Modify: `app/globals.css:325-344` (the `.rcpt-*` rules)

**Interfaces:** none (pure CSS).

Context: `.rcpt-parties` children are flex items with default `min-width:auto`, so a long description in `<b>{inv.description}</b>` can't shrink and pushes past the 560px card; the `.rcpt-acct` line (`acctNumber · acctName · bankName`) and the `.rcpt-verify code` URL have the same problem with long unbroken strings.

- [ ] **Step 1: Add wrap/shrink rules**

In `app/globals.css`, edit these existing rules (keep everything already there, add the new declarations):

```css
.rcpt-parties{display:flex;gap:40px;margin-bottom:22px}
.rcpt-parties>div{min-width:0}
.rcpt-parties b{font-size:15px;overflow-wrap:anywhere}
.rcpt-table td{padding:10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.rcpt-acct{background:var(--paper-2);border:1px solid var(--line);border-radius:10px;padding:13px 15px;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.rcpt-verify code{display:block;font-family:var(--mono);font-size:17px;letter-spacing:.08em;color:var(--accent-2);margin:5px 0 6px;overflow-wrap:anywhere}
```

(Concretely: add the one new `.rcpt-parties>div{min-width:0}` rule after line 325, append `overflow-wrap:anywhere` to `.rcpt-parties b`, `.rcpt-table td`, `.rcpt-acct`, and `.rcpt-verify code`.)

- [ ] **Step 2: Visual check**

With `npm run dev` running: open any invoice → drawer → "⤓ Invoice PDF", and temporarily create an invoice whose description is one 120-character unbroken string; confirm nothing escapes the card at 375px viewport width.

- [ ] **Step 3: Leave in working tree.**

---

### Task 3: Multi-line descriptions (light line-items)

**Files:**
- Modify: `app/app/invoices/page.tsx:525-526` (modal field), `:141` (table cell), `:402` (drawer)
- Modify: `app/api/invoices/route.ts:26` (length cap)
- Modify: `app/pay/[token]/invoice/page.tsx:53, 56-64` (PDF rendering)

**Interfaces:**
- `Invoice.description` stays a single `string`; lines are separated by `\n`. First line = the summary everywhere space is tight; the invoice PDF renders each line as its own table row.

- [ ] **Step 1: Make the modal field a textarea**

In `app/app/invoices/page.tsx` replace lines 525–526:

```tsx
            <label htmlFor="ni-desc">Description — one line per item</label>
            <textarea id="ni-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={"e.g. Bulk order — March\nDelivery to Apapa\nInstallation"} />
```

(The `.modal textarea` inherits input styling? Check `globals.css` — if `.modal input` is styled but not `textarea`, extend the selector: find the `.modal input` rule and change it to `.modal input,.modal textarea{...}` plus `resize:vertical;font-family:var(--sans)`.)

- [ ] **Step 2: Raise the validation cap**

In `app/api/invoices/route.ts:26` change `280` → `500`:

```ts
  const descR = optString(body.description, "description", 500);
```

- [ ] **Step 3: Render lines as rows on the invoice PDF**

In `app/pay/[token]/invoice/page.tsx`: add above the return (after line 37):

```tsx
  const lines = (inv.description || "Services rendered").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
```

Replace the "For" party (line 53) so the header shows only the first line:

```tsx
          <div><span>For</span><b>{lines[0]}</b></div>
```

Replace the single table row (lines 58–63) with one row per line — amount shown on the last row only (the invoice has one total; this is a breakdown of what it covers, not per-line pricing):

```tsx
          <tbody>
            {lines.map((l, n) => (
              <tr key={n}>
                <td>{l}</td>
                <td className="r mono">{n === lines.length - 1 ? NGN(inv.amount) : ""}</td>
              </tr>
            ))}
          </tbody>
```

- [ ] **Step 4: First-line summaries in dense UI**

`app/app/invoices/page.tsx:141` — table cell small text:

```tsx
<small style={{ color: "var(--muted)" }}>{i.description.split(/\r?\n/)[0]}</small>
```

`app/app/invoices/page.tsx:402` — drawer shows all lines:

```tsx
<div style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "pre-line" }}>{invoice.description}</div>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → exits 0. Then in dev: create an invoice with a 3-line description → table shows line 1, drawer shows all 3, invoice PDF shows 3 rows with the total on the last.

- [ ] **Step 6: Leave in working tree.**

---

### Task 4: Withdrawal record in the store (TDD)

**Files:**
- Modify: `lib/types.ts` (add `Withdrawal`)
- Modify: `lib/store.ts` (StoreShape, seed, load, persist, new functions)
- Test: `lib/store.test.ts` (append tests)

**Interfaces:**
- Produces: `recordWithdrawal(input: Omit<Withdrawal, "time"> & { time?: string }): Withdrawal` — idempotent on `id` (returns the existing record unchanged on replay). `listWithdrawals(tenantId: string): Withdrawal[]` sorted newest-first. Task 5 consumes both.

- [ ] **Step 1: Add the type** (`lib/types.ts`, after the `FeedEvent` interface):

```ts
// A payout of settled collections to the merchant's own bank account (operator-initiated).
export interface Withdrawal {
  id: string;            // wd_<client ref> — idempotency identity for replays
  tenantId: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;   // bank-confirmed via lookup, never user-typed
  narration: string;
  live: boolean;         // true only when the Nomba transfer actually settled
  time: string;          // ISO
}
```

- [ ] **Step 2: Write the failing tests** (append to `lib/store.test.ts`; follow the file's existing import style — add `recordWithdrawal, listWithdrawals` to the `./store` import and `Withdrawal` type if needed):

```ts
test("recordWithdrawal persists, audits, and is idempotent on id", () => {
  const input = {
    id: "wd_test_0001", tenantId: DEMO_TENANT_ID, amount: 150.5,
    bankCode: "058", accountNumber: "0107841806", accountName: "CRESIOLABS LTD",
    narration: "PaidUp payout", live: false,
  };
  const first = recordWithdrawal(input);
  assert.equal(first.amount, 150.5);
  const replay = recordWithdrawal({ ...input, amount: 999999 }); // replayed request must NOT double-record
  assert.equal(replay.amount, 150.5);
  const mine = listWithdrawals(DEMO_TENANT_ID);
  assert.equal(mine.filter((w) => w.id === "wd_test_0001").length, 1);
});

test("listWithdrawals is tenant-scoped", () => {
  recordWithdrawal({
    id: "wd_test_0002", tenantId: "ten_other", amount: 10,
    bankCode: "058", accountNumber: "0000000000", accountName: "X",
    narration: "n", live: false,
  });
  assert.ok(!listWithdrawals(DEMO_TENANT_ID).some((w) => w.id === "wd_test_0002"));
});

test("recordWithdrawal rejects invalid amounts", () => {
  assert.throws(() => recordWithdrawal({
    id: "wd_test_bad", tenantId: DEMO_TENANT_ID, amount: NaN,
    bankCode: "058", accountNumber: "0107841806", accountName: "X",
    narration: "n", live: false,
  }));
});
```

(`DEMO_TENANT_ID` and `assert`/`test` imports already exist in the file — reuse them.)

- [ ] **Step 3: Run to verify failure**

Run: `node --test lib/store.test.ts`
Expected: FAIL — `recordWithdrawal` is not exported.

- [ ] **Step 4: Implement** in `lib/store.ts`:

(a) Find `interface StoreShape` and add `withdrawals: Withdrawal[];` (import `Withdrawal` from `./types`).
(b) In `seed()`'s `const s: StoreShape = {...}` add `withdrawals: [],`.
(c) In `load()`'s raw type add `withdrawals?: Withdrawal[];` and in the constructed `s` add `withdrawals: raw.withdrawals ?? [],`.
(d) In `persist()`'s `JSON.stringify({...})` add `withdrawals: s.withdrawals,`.
(e) Add the functions (near `markRefunded`):

```ts
/** Record an operator payout of settled collections. Idempotent on id — a replayed request
 *  (same client ref / idempotency key) returns the original record and never double-logs. */
export function recordWithdrawal(input: Omit<Withdrawal, "time"> & { time?: string }): Withdrawal {
  const s = store();
  const existing = s.withdrawals.find((w) => w.id === input.id);
  if (existing) return existing;
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid withdrawal amount");
  const w: Withdrawal = { ...input, amount, time: input.time ?? new Date().toISOString() };
  s.withdrawals.push(w);
  recordAudit(s, "withdrawal", `${w.id} ${w.amount} -> ${w.bankCode}/${w.accountNumber}${w.live ? "" : " (demo)"}`, w.time, w.tenantId);
  persist(s);
  return w;
}

export function listWithdrawals(tenantId: string): Withdrawal[] {
  return store().withdrawals
    .filter((w) => w.tenantId === tenantId)
    .sort((a, b) => b.time.localeCompare(a.time));
}
```

- [ ] **Step 5: Run tests**

Run: `node --test lib/store.test.ts` → all pass. Then the full suite: `npm test` → all pass (tenant isolation tests must stay green).

- [ ] **Step 6: Leave in working tree.**

---

### Task 5: `/api/withdraw` route

**Files:**
- Create: `app/api/withdraw/route.ts`

**Interfaces:**
- Consumes: `recordWithdrawal`, `listWithdrawals`, `DEMO_TENANT_ID` (Task 4); `getSubAccountBalance`, `listBanks`, `lookupBankAccount`, `transferToBank`, `nombaConfigured` (`lib/nomba.ts`); `requireSession`, validators.
- Produces: `GET /api/withdraw` → `{ operator: boolean, configured: boolean, balance: {amount,currency} | null, banks: {code,name}[], withdrawals: Withdrawal[] }`; `POST` body `{ ref, amount, bankCode, accountNumber }` → `{ ok: true, withdrawal, live }`. Task 6 consumes both.

Note: `middleware.ts` already gates all of `/api` behind the session cookie except its public allow-list — a NEW route is protected by default; `requireSession()` inside is the second (defense-in-depth) check, same as every other route.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { DEMO_TENANT_ID, listWithdrawals, recordWithdrawal } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { getSubAccountBalance, listBanks, lookupBankAccount, nombaConfigured, transferToBank } from "@/lib/nomba";
import { parseJsonBody, posAmount, reqString } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Withdraw settled collections to the merchant's own bank account.
// The Nomba sub-account is GLOBAL (every tenant's VA credits sweep into the one hackathon
// sub-account), so payouts are operator-workspace-only until per-tenant sub-accounts exist.
// Same flow the refund route proved in production: lookup (confirm name) -> /v2/transfers/bank
// with a STABLE idempotency key; the ledger only ever records what actually happened.

const isOperator = (tid: string) => tid === DEMO_TENANT_ID;

// Bank list rarely changes — cache it for the process lifetime.
let bankCache: Array<{ code: string; name: string }> | null = null;

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isOperator(session.tid)) {
    return NextResponse.json({ operator: false, configured: false, balance: null, banks: [], withdrawals: [] });
  }
  let balance: { amount: number; currency: string } | null = null;
  if (nombaConfigured()) {
    try { balance = await getSubAccountBalance(); } catch { /* non-fatal — figure omitted */ }
    try { bankCache = bankCache ?? await listBanks(); } catch { /* picker degrades to code input */ }
  }
  return NextResponse.json({
    operator: true, configured: nombaConfigured(), balance,
    banks: bankCache ?? [], withdrawals: listWithdrawals(session.tid),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isOperator(session.tid)) {
    return NextResponse.json({ error: "withdrawals are operator-only in this MVP (shared settlement account)" }, { status: 403 });
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

  const demo = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
  let live = false;
  let accountName = "";

  if (nombaConfigured()) {
    // Never send more than is actually settled. If the balance is unreadable, fail closed in prod.
    try {
      const bal = await getSubAccountBalance();
      if (amount > bal.amount) {
        return NextResponse.json({ error: `amount exceeds settled balance (₦${bal.amount})` }, { status: 400 });
      }
    } catch {
      if (!demo) return NextResponse.json({ error: "could not confirm settled balance — try again" }, { status: 502 });
    }
    try {
      const acct = await lookupBankAccount(acctR.value, bankR.value);
      accountName = acct.accountName; // bank-confirmed, never user-typed
      await transferToBank({
        amount,
        accountNumber: acctR.value,
        accountName,
        bankCode: bankR.value,
        narration: "PaidUp payout of settled collections",
        idempotencyKey: `withdraw_${refR.value}`,
      });
      live = true;
    } catch (e) {
      // transferToBank throws unless data.status === SUCCESS — genuine non-settlement.
      if (!demo) return NextResponse.json({ error: "withdrawal did not settle — ledger unchanged", detail: String((e as Error)?.message ?? e) }, { status: 502 });
    }
  }

  // Reached when: settled (live), OR explicit demo / unconfigured build (recorded, labelled demo).
  const withdrawal = recordWithdrawal({
    id: `wd_${refR.value}`, tenantId: session.tid, amount,
    bankCode: bankR.value, accountNumber: acctR.value,
    accountName: accountName || "(unverified — demo)",
    narration: "PaidUp payout of settled collections", live,
  });
  return NextResponse.json({ ok: true, withdrawal, live });
}
```

- [ ] **Step 2: Verify compile + behaviour**

Run: `npx tsc --noEmit` → 0. Then with dev up, logged in as `demo@paidup.app`:
`GET /api/withdraw` → `operator:true`, withdrawals `[]`. POST with `{ref:"t1", amount:50, bankCode:"058", accountNumber:"0107841806"}` → `{ok:true, live:false}` (dev = demo mode, Nomba may be unconfigured locally). Re-POST the same `ref` → same withdrawal back, not a second record. As a non-demo tenant → 403.

- [ ] **Step 3: Run the full suite**

Run: `npm test` → green.

- [ ] **Step 4: Leave in working tree.**

---

### Task 6: Withdraw card + dialog in the dashboard

**Files:**
- Modify: `app/app/invoices/page.tsx` (mount after the `.kpis` div at line 98; new components at the bottom of the file, reusing the file's own `useDialogA11y`)

**Interfaces:**
- Consumes: `GET/POST /api/withdraw` (Task 5 shapes).

- [ ] **Step 1: Add the card + dialog components** (bottom of `app/app/invoices/page.tsx`):

```tsx
function WithdrawCard() {
  const [info, setInfo] = useState<{
    operator: boolean; configured: boolean;
    balance: { amount: number; currency: string } | null;
    banks: Array<{ code: string; name: string }>;
    withdrawals: Array<{ id: string; amount: number; accountName: string; live: boolean; time: string }>;
  } | null>(null);
  const [show, setShow] = useState(false);

  const load = async () => {
    try { const r = await fetch("/api/withdraw"); if (r.ok) setInfo(await r.json()); } catch { /* card hides */ }
  };
  useEffect(() => { load(); }, []);

  if (!info?.operator) return null; // non-operator tenants: shared settlement account, no payout yet
  const last = info.withdrawals[0];
  return (
    <div className="kpi" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="lab">Settled at Nomba</div>
      <div className="val naira">{info.balance ? NGN(info.balance.amount) : "—"}</div>
      <div className="delta">
        {last ? `last payout ${NGN(last.amount)}${last.live ? "" : " (demo)"} · ${timeAgo(last.time)}` : "no payouts yet"}
      </div>
      <button className="btn sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => setShow(true)}>
        ↗ Withdraw
      </button>
      {show && <WithdrawModal info={info} onClose={() => setShow(false)} onDone={load} />}
    </div>
  );
}

function WithdrawModal({ info, onClose, onDone }: {
  info: { balance: { amount: number } | null; banks: Array<{ code: string; name: string }> };
  onClose: () => void; onDone: () => void;
}) {
  // One ref per dialog-open = the idempotency identity; a retried submit can never pay out twice.
  const refId = useRef<string>(crypto.randomUUID().replace(/-/g, "").slice(0, 24));
  const [bankCode, setBankCode] = useState(info.banks[0]?.code ?? "");
  const [acct, setAcct] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ accountName: string; amount: number; live: boolean } | null>(null);
  const dref = useDialogA11y<HTMLDivElement>(onClose);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amt = parseFloat(amount);
    if (!bankCode || !/^\d{10}$/.test(acct) || !amt || amt <= 0) {
      setErr("Pick a bank, enter a 10-digit account number and a positive amount."); return;
    }
    setBusy(true); setErr("");
    const r = await fetch("/api/withdraw", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: refId.current, amount: amt, bankCode, accountNumber: acct }),
    });
    setBusy(false);
    const j = await r.json().catch(() => null);
    if (!r.ok) { setErr(j?.error || "Withdrawal failed."); return; }
    setDone({ accountName: j.withdrawal.accountName, amount: j.withdrawal.amount, live: j.live });
    onDone();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={dref} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Withdraw settled funds">
        {!done ? (
          <form onSubmit={submit}>
            <h3>Withdraw to your bank</h3>
            <p className="sub" style={{ marginTop: 0 }}>
              {info.balance ? <>Settled and available: <b className="naira">{NGN(info.balance.amount)}</b>.</> : "Balance unavailable — the transfer is still balance-checked server-side."}
              {" "}Sent over Nomba; the recipient name is bank-confirmed before any money moves.
            </p>
            <label htmlFor="wd-bank">Bank</label>
            {info.banks.length ? (
              <select id="wd-bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                {info.banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            ) : (
              <input id="wd-bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="Bank code, e.g. 058" />
            )}
            <label htmlFor="wd-acct">Account number</label>
            <input id="wd-acct" value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit NUBAN" inputMode="numeric" />
            <label htmlFor="wd-amt">Amount (₦)</label>
            <input id="wd-amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200" />
            {err && <div role="alert" style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div className="row">
              <button className="ghost" type="button" onClick={onClose}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Withdraw"}</button>
            </div>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>{done.live ? "✅" : "🧾"}</div>
            <h3 style={{ marginTop: 8 }}>{done.live ? "Payout sent" : "Payout recorded (demo)"}</h3>
            <p className="sub" style={{ margin: "0 auto 18px" }}>
              {NGN(done.amount)} to <b>{done.accountName}</b>{done.live ? " — settled over Nomba." : " — demo mode: no live transfer was made."}
            </p>
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it** — in the KPI grid (`app/app/invoices/page.tsx:93-98`), add `<WithdrawCard />` as the last cell before the closing `</div>` of `.kpis`. If `select`/`textarea` lack modal styling, extend the `.modal input` rule in `globals.css` to `.modal input,.modal select,.modal textarea{...}`.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` → 0. In dev as demo login: card appears with balance (or "—"), dialog validates, submit records a demo payout, replayed submit (click twice) yields one record; log in as a fresh signup tenant → no card.

- [ ] **Step 4: Leave in working tree.**

---

### Task 7: Full verification sweep

- [ ] **Step 1:** Stop `npm run dev` if running.
- [ ] **Step 2:** Run `npm test` → every suite green (store, reconcile, verify, tenant, anomaly, export, validate, password…).
- [ ] **Step 3:** Run `npm run build` → green.
- [ ] **Step 4:** `rm -rf .next` then restart `npm run dev` (post-build cache rule) and click through: create multi-line invoice → PDF rows + no overflow → withdraw dialog demo payout → audit trail (`/api/audit?format=csv`) contains the `withdrawal` entry.
- [ ] **Step 5:** Report status to the user — everything stays uncommitted per the no-auto-commit rule.

## Out of scope (explicitly deferred)
- VPS ledger backfill of the blank `bankName` on the already-created real invoice (ops task on the ZEAL VPS).
- Per-tenant sub-accounts (would let every tenant withdraw; needs Nomba sub-account-per-tenant provisioning).
- Full line items with qty × unit price (touches the money path days before submission).
- Rate limiting VA creation (user deferred; Nomba's 15 POST/sec is the backstop).
