# PaidUp Final-Submission Edge Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four judge-visible, money-path-safe edge features (verified-payment page + receipt QR, WhatsApp sharing, due-dates/overdue/reminders, live pay-page confirmation, bank-network requery) and truth-up the submission docs, all before the July 7 2026 11:59 PM deadline.

**Architecture:** Every feature is additive and isolated. New pure helpers (`lib/share.ts`, `lib/due.ts`, additions to `lib/receipt.ts`) are unit-tested with `node --test`. New public surfaces (`/pay/[token]/verify`, `/api/pay-status/[token]`) read the existing token/store plumbing and never mutate the ledger. The one money-path-adjacent change (persisting `sessionId` for requery) adds an optional field and touches no reconciliation logic. Tasks are ordered so the lowest-value/highest-risk task is last and the plan is **cut-from-the-bottom safe**: dropping any suffix of Tasks 1–5 still leaves a coherent shippable set.

**Tech Stack:** Next.js 14.2 (App Router, server + client components), React 18, TypeScript 5.5, `node --test` (native TS type-strip), `qrcode` (already a dep), MongoDB-backed store (async), `wa.me` deep links (no API/approval), Nomba REST client (`lib/nomba.ts`).

## Global Constraints

- **The money path is sacred.** `lib/reconcile.ts` and `lib/verify.ts` MUST NOT change. `npm test` MUST stay green after every task. Preserve exact→paid, under→partial, over→overpaid, reversal→un-reconcile, kobo-tolerance, NaN rejection.
- **HMAC 9-field signing string MUST NOT change** (`lib/verify.ts` `buildSigningString`) — it is a scored security criterion matched against the Nomba docs vector. `sessionId` is NOT one of the 9 fields; adding it to types must not touch `buildSigningString`.
- **AI degrades to null** — not touched by this plan; do not add AI to any 2s poll.
- **No secrets in git.** Credentials live only in `.env.local` / host env (gitignored).
- **Multi-tenant scoping:** every new authed API route starts with `requireSession()` and scopes reads to `session.tid`. The two NEW public routes (`/pay/[token]/verify` page, `/api/pay-status/[token]`) are reached by the unguessable `payToken` only and expose ONLY payer-relevant fields (status, paid, amount, receipt figures) — never the rest of the ledger, never another tenant's data.
- **Design = "The Ledger":** reuse existing CSS classes/tokens in `app/globals.css` (`.paycard`, `.pay-settled`, `.chip`, `.btn`, `.ghost`, `.copy`, `var(--accent)`, `var(--attn)`, `var(--paid)`). No new dark-dashboard styling; no new fonts.
- **Dev server runs on port 3100** (`npm run dev` → http://localhost:3100). Demo login: `demo@paidup.app` / `LedgerDemo2026`.
- **Money is naira floats** with round-2 + kobo tolerance at every arithmetic point (`Math.round(x * 100) / 100`).
- **New `*.test.ts` files MUST be added to the `test` script in `package.json`** (it lists files explicitly) or they won't run.

---

## File Structure (what changes and why)

**New files:**
- `lib/share.ts` — pure WhatsApp/message-builder helpers (`whatsappShareUrl`, `payMessage`, `reminderMessage`). One responsibility: turn invoice facts into a shareable message + `wa.me` URL.
- `lib/share.test.ts` — unit tests for the above.
- `lib/due.ts` — pure due-date presentation (`dueMeta`): label + overdue flag from an ISO date.
- `lib/due.test.ts` — unit tests for `dueMeta`.
- `app/pay/[token]/verify/page.tsx` — public "this payment is real" verification page (anti-fake-alert), reached by pay token.
- `app/api/pay-status/[token]/route.ts` — public, read-only `{status, paid, amount, isPaid}` for the live pay-page flip.
- `app/pay/[token]/PayStatusPoller.tsx` — client poller that calls `router.refresh()` when the invoice becomes paid.
- `app/api/requery/route.ts` — authed, read-only "verify with the bank network" endpoint (Task 5).

**Modified files:**
- `lib/receipt.ts` (+`lib/receipt.test.ts`) — add pure `paymentSummary(inv)`.
- `app/pay/[token]/receipt/page.tsx` — add a verification QR linking to the verify page.
- `app/pay/[token]/page.tsx` — add WhatsApp share; mount the live poller when unpaid.
- `app/app/invoices/page.tsx` — WhatsApp share + overdue label + reminder button + optional due-date input.
- `app/api/invoices/route.ts` — accept + validate `dueDate`.
- `lib/store.ts` — persist `dueDate` in `createInvoice`; persist `sessionId` in `applyPayment`; add read-only `findTenantPayment`.
- `lib/types.ts` — add `Invoice.dueDate?`, `Payment.sessionId?`, `IncomingPayment.sessionId?`, webhook `transaction.sessionId?`.
- `app/api/webhook/route.ts` — pass `sessionId` into `applyPayment`.
- `lib/nomba.ts` — add `requery(sessionId)`.
- `middleware.ts` — allowlist `/api/pay-status` as public.
- `package.json` — register new test files.
- `README.md`, `SECURITY.md`, `DEMO.md`, `GAPS.md` — truth-up (Task 0).

---

## Task 0: Submission docs truth-up sweep

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `DEMO.md`
- Modify: `GAPS.md`

**Interfaces:** None (docs only). No tests; verification is grep + read.

Rationale: the docs describe a weaker/older product than what ships (still "file-backed store, swap for Postgres", retired Simulate panel, wrong test counts, no mention of withdrawals/settings/receipts/reports/mobile/Mongo). Judges read these three files. Zero code risk, highest points-per-hour.

- [ ] **Step 1: Establish the real test count**

Run: `npm test 2>&1 | Select-String "tests "` (PowerShell) or `npm test 2>&1 | grep "^. tests"`
Expected: a line like `ℹ tests 136`. Record this number `N` (e.g. 136); every doc test-count claim below must become `N`.

- [ ] **Step 2: README.md — replace stale infrastructure claims**

Grep each stale string and replace:
- Find `⚡ Simulate payment panel` (line ~20) → delete that bullet entirely (the panel was retired in commit `33e6dd9`).
- Find `durable file-backed multi-tenant ledger (SWAP for Postgres` (line ~68) → replace with: `MongoDB-backed MULTI-TENANT ledger — transactional money path (all-or-nothing), unique-index atomic dedupe (lib/db.ts = connection/indexes)`.
- Find `Durable file-backed ledger (\`.data/ledger.json\`)` (line ~116) → replace with: `Durable MongoDB ledger — payment/reversal/withdrawal each mutate invoice + feed event + dedupe claim + audit entry atomically in one transaction`.
- Find the "Known limits" block leading with `File-backed store… not serverless… swap for Postgres` (lines ~127-129) → replace with: `Store is MongoDB (transactional, multi-instance-safe). VA creation is mocked by default; pass \`useNomba:true\` for a real sandbox VA. Money is naira floats with round-2 + kobo-tolerance guards (integer-kobo refactor deferred).`
- Find `125 unit tests` (line ~87) → replace with `N unit tests`.

- [ ] **Step 3: README.md — add the shipped-but-undocumented surfaces**

In the architecture/"what's wired" section, add these entries (they exist in the codebase but are absent from the tree): `app/app/withdraw` (payout to any Nigerian bank), `app/app/settings` (rename workspace, change password, clear/delete account), `app/app/reports/{ledger,audit}` (printable PDF reports), `app/api/{withdraw,account,audit,flags}`, `app/pay/[token]/{receipt,invoice,verify}` (payer receipt/invoice/verification PDFs), `lib/{db,audit,receipt,qr,share,due}.ts`. Add a one-line "What's new" list: withdrawals to bank · account settings · payer receipt + verification · WhatsApp sharing · due-dates & reminders · mobile-responsive UI · MongoDB transactional ledger.

- [ ] **Step 4: SECURITY.md — replace stale durability model, add stronger true claims**

- Find `ledger + processed-tx set are file-backed` / `Serverless needs Postgres` (lines ~29-30) → replace with: `Ledger is MongoDB. Money-path mutations are transactional (invoice + feed event + dedupe claim + audit entry commit all-or-nothing). Webhook replay is a duplicate-key error on a UNIQUE seenTx index — a race can never double-credit.`
- Add a new bullet under reliability: `Tamper-evident audit trail — every money event chains a SHA-256 hash over the prior entry (lib/audit.ts: hashEntry/verifyChain/GENESIS); verifyAudit() re-checks the whole chain.`
- Add a new bullet: `Withdraw money-safety — write-ahead reserve before the transfer, balance-capped, bank-confirmed recipient name, idempotent \`wd_\` refs; account deletion refuses while a payout is \`pending\` (payout_in_flight 409).`
- Find `123 unit tests` (line ~82) → `N unit tests`.

- [ ] **Step 5: DEMO.md — fix the broken reset + add new beats + fix count**

- Find both `rm -f .data/ledger.json` occurrences (lines ~10, ~101) → replace with a Mongo-safe reset note: `Reset for a fresh demo: drop the dev database (\`mongosh paidup --eval "db.dropDatabase()"\`) OR use the seeded demo workspace as-is. (The file-backed \`.data/ledger.json\` no longer exists.)`
- Find `125 unit tests` (line ~91) → `N unit tests`.
- Add a **Withdraw closing beat**: "Collected → reconciled → **paid out to my own bank** — a real ₦ transfer on camera (`/app/withdraw`), the full money-in-to-money-out loop."
- Add a **Receipt / verification beat**: "The payer opens `/pay/<token>/receipt` (save-as-PDF) and scans the verification QR → `/pay/<token>/verify` shows the payment is real — the answer to fake bank alerts."
- Change the opener to point at the hosted `paidup.site` deployment rather than localhost+ngrok.

- [ ] **Step 6: GAPS.md — close the finished "Postgres swap" item**

- Find the "genuinely open / deferred" line referencing `Postgres swap` / `file-backed store` (lines ~199, ~451) → mark it DONE: `RESOLVED 2026-07-06 — migrated to a transactional MongoDB store (lib/db.ts, lib/store.ts); the file-backed limitation no longer exists.`

- [ ] **Step 7: Verify no stale claims remain**

Run: `git grep -n -i -E "file-backed|swap for postgres|125 unit|123 unit|simulate payment panel|ledger\.json" -- README.md SECURITY.md DEMO.md GAPS.md`
Expected: only intentional historical mentions remain (e.g. the DEMO reset note explaining the file is gone). No live claim that the store is file-backed or that Postgres is a future TODO.

- [ ] **Step 8: Commit**

```bash
git add README.md SECURITY.md DEMO.md GAPS.md
git commit -m "docs: truth-up submission docs to the shipped product (Mongo, withdraw, receipts, reports, mobile)"
```

---

## Task 1: Verified-payment page + receipt QR

**Files:**
- Modify: `lib/receipt.ts`
- Test: `lib/receipt.test.ts` (add cases; already in the test script)
- Create: `app/pay/[token]/verify/page.tsx`
- Modify: `app/pay/[token]/receipt/page.tsx`

**Interfaces:**
- Consumes: `getInvoiceByToken(token) => Promise<Invoice | undefined>` (store), `receiptHash(inv) => string`, `receiptNumber(inv) => string` (receipt), `qrSvg(text) => Promise<string>` (qr), `NGN(n) => string` (format).
- Produces: `paymentSummary(inv: Invoice) => { received: number; lastTime: string | null; count: number }` (pure, from `lib/receipt.ts`).

- [ ] **Step 1: Write the failing test for `paymentSummary`**

Open `lib/receipt.test.ts`. Add:

```ts
import { paymentSummary } from "./receipt.ts";

test("paymentSummary sums active payments, ignores reversed, reports the last time + count", () => {
  const inv = {
    id: "INV-1", tenantId: "t", customer: "C", description: "x", amount: 1000, paid: 700,
    status: "partial", createdAt: "2026-01-01T00:00:00Z", acctNumber: "1", acctName: "a", bankName: "b",
    payments: [
      { transactionId: "p1", amount: 500, sender: "C", time: "2026-01-01T10:00:00Z", outcome: "partial" },
      { transactionId: "p2", amount: 200, sender: "C", time: "2026-01-02T10:00:00Z", outcome: "partial" },
      { transactionId: "p3", amount: 300, sender: "C", time: "2026-01-03T10:00:00Z", outcome: "reversed" },
    ],
  } as unknown as import("./types.ts").Invoice;
  const s = paymentSummary(inv);
  assert.equal(s.received, 700);        // 500 + 200, reversed excluded
  assert.equal(s.count, 2);
  assert.equal(s.lastTime, "2026-01-02T10:00:00Z");
});

test("paymentSummary on an unpaid invoice returns zeros and null time", () => {
  const inv = { id: "INV-2", amount: 500, paid: 0, payments: [] } as unknown as import("./types.ts").Invoice;
  const s = paymentSummary(inv);
  assert.deepEqual(s, { received: 0, lastTime: null, count: 0 });
});
```

(If `lib/receipt.test.ts` has no `import { test } from "node:test"` / `assert` header, mirror the header from `lib/reconcile.test.ts`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --env-file=.env.local --test lib/receipt.test.ts`
Expected: FAIL — `paymentSummary` is not exported.

- [ ] **Step 3: Implement `paymentSummary` in `lib/receipt.ts`**

Append to `lib/receipt.ts`:

```ts
/** Active (non-reversed) payment total, last payment time, and count — for the verification page. */
export function paymentSummary(inv: Invoice): { received: number; lastTime: string | null; count: number } {
  const active = inv.payments.filter((p) => p.outcome !== "reversed");
  const received = active.reduce((s, p) => s + p.amount, 0);
  return {
    received: Math.round(received * 100) / 100,
    lastTime: active.length ? active[active.length - 1].time : null,
    count: active.length,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --env-file=.env.local --test lib/receipt.test.ts`
Expected: PASS (all cases in the file).

- [ ] **Step 5: Create the public verification page**

Create `app/pay/[token]/verify/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getInvoiceByToken } from "@/lib/store";
import { receiptHash, receiptNumber, paymentSummary } from "@/lib/receipt";
import { NGN } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify payment — PaidUp", robots: { index: false, follow: false } };

// Public anti-fake-alert verification page. Anyone (payer, the business, a third party) can reach it via
// the unguessable pay token and confirm a payment is REAL: it reads the authoritative ledger, shows the
// received total + tamper-evident code, and — unlike a bank SMS — cannot be forged. Payer-only fields.
export default async function VerifyPage({ params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);

  if (!inv) {
    return (
      <main className="paypage">
        <div className="paycard"><div className="empty-state" style={{ padding: "36px 8px" }}>
          <span className="ico">🔗</span><b>Nothing to verify</b>
          <span>This verification link is invalid or expired. Ask the business to resend it.</span>
        </div></div>
      </main>
    );
  }

  const { received, lastTime, count } = paymentSummary(inv);
  const verified = count > 0;

  return (
    <main className="paypage">
      <div className="paycard">
        <div className="pay-brand"><img src="/logo.svg" alt="" width={26} height={26} style={{ borderRadius: 6, verticalAlign: "middle" }} /> PaidUp</div>

        {verified ? (
          <div className="pay-settled" role="status">
            <span className="big">✓ Payment verified</span>
            <span>
              <b className="naira">{NGN(received)}</b> received against <span className="mono">{inv.id}</span>
              {lastTime ? <> · last payment {new Date(lastTime).toLocaleString()}</> : null}.
            </span>
            <span>Billed to {inv.customer} · {inv.description}</span>
          </div>
        ) : (
          <div className="pay-amount" style={{ marginTop: 8 }}>
            <span className="lab">No payment recorded yet</span>
            <span className="big naira">{NGN(inv.amount)}</span>
            <span className="part">This invoice ({inv.id}) has not been paid. Nothing to verify — do not release goods on the strength of an SMS alert.</span>
          </div>
        )}

        <div className="rcpt-verify" style={{ marginTop: 18 }}>
          <span>Verification code</span>
          <code>{receiptHash(inv)}</code>
          <p>This code is derived from PaidUp&apos;s ledger figures for {receiptNumber(inv)}. A bank alert SMS can be faked — this record is confirmed against the money PaidUp actually received, and the code changes if any figure is altered.</p>
        </div>

        <div className="rcpt-actions print-hide" style={{ marginTop: 16 }}>
          <Link className="ghost" href={`/pay/${inv.payToken}`}>← Back to payment page</Link>
          <Link className="ghost" href={`/pay/${inv.payToken}/receipt`}>View full receipt →</Link>
        </div>

        <p className="pay-foot">Verified by <b>PaidUp</b> · reconciled from an HMAC-verified Nomba bank webhook · not an SMS.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Add the verification QR to the receipt page**

In `app/pay/[token]/receipt/page.tsx`, add the imports at the top (alongside the existing imports):

```ts
import { headers } from "next/headers";
import { qrSvg } from "@/lib/qr";
```

Immediately after the `const balance = ...` line (currently line ~29), add:

```ts
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "paidup.site"}`;
  const verifyUrl = `${origin}/pay/${inv.payToken}/verify`;
  const verifyQr = await qrSvg(verifyUrl);
```

Then replace the existing `<div className="rcpt-verify">…</div>` block with one that adds the QR:

```tsx
        <div className="rcpt-verify">
          <span>Verification code</span>
          <code>{receiptHash(inv)}</code>
          <p>This code is derived from the receipt&apos;s figures — if any amount is altered it no longer matches PaidUp&apos;s records.</p>
          <div className="rcpt-verify-qr" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden="true" style={{ width: 96, height: 96 }} dangerouslySetInnerHTML={{ __html: verifyQr }} />
            <span style={{ fontSize: 12, color: "var(--faint)" }}>Scan to verify this payment is real at <span className="mono">{verifyUrl}</span></span>
          </div>
        </div>
```

- [ ] **Step 7: Verify in the browser (running dev server on :3100)**

- Log in as demo, open an invoice that HAS payments (e.g. a seeded `paid`/`overpaid` one), copy its pay-token URL.
- Visit `/pay/<token>/verify` → expect the green "✓ Payment verified" with the received amount and code.
- Visit `/pay/<token>/receipt` → expect the receipt now shows a QR next to the verification code; the QR text is the absolute `.../verify` URL.
- Visit `/pay/<token>/verify` for an UNPAID invoice → expect the "No payment recorded yet" state.

- [ ] **Step 8: Commit**

```bash
git add lib/receipt.ts lib/receipt.test.ts app/pay/[token]/verify/page.tsx app/pay/[token]/receipt/page.tsx
git commit -m "feat(pay): public verified-payment page + receipt verification QR (anti-fake-alert)"
```

---

## Task 2: WhatsApp sharing

**Files:**
- Create: `lib/share.ts`
- Create: `lib/share.test.ts`
- Modify: `package.json` (register the new test file)
- Modify: `app/app/invoices/page.tsx` (drawer share row + new-invoice success)
- Modify: `app/pay/[token]/page.tsx` (payer can forward the link)

**Interfaces:**
- Consumes: `NGN(n)` from `lib/format.ts`.
- Produces (all pure, from `lib/share.ts`):
  - `whatsappShareUrl(text: string) => string`
  - `payMessage(o: { customer: string; id: string; amount: number; url: string }) => string`
  - `reminderMessage(o: { customer: string; id: string; balance: number; url: string; overdueDays: number }) => string`

- [ ] **Step 1: Write the failing test**

Create `lib/share.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappShareUrl, payMessage, reminderMessage } from "./share.ts";

test("whatsappShareUrl builds a wa.me link with url-encoded text", () => {
  const u = whatsappShareUrl("Pay ₦100 now");
  assert.ok(u.startsWith("https://wa.me/?text="));
  assert.ok(u.includes(encodeURIComponent("Pay ₦100 now")));
});

test("payMessage names the customer, invoice, amount and pay link", () => {
  const m = payMessage({ customer: "Dangote", id: "INV-1042", amount: 450000, url: "https://paidup.site/pay/tok_x" });
  assert.ok(m.includes("Dangote"));
  assert.ok(m.includes("INV-1042"));
  assert.ok(m.includes("₦450,000"));
  assert.ok(m.includes("https://paidup.site/pay/tok_x"));
});

test("reminderMessage says overdue when overdueDays > 0, and includes the balance", () => {
  const overdue = reminderMessage({ customer: "Jumia", id: "INV-1043", balance: 50000, url: "u", overdueDays: 3 });
  assert.ok(overdue.toLowerCase().includes("overdue"));
  assert.ok(overdue.includes("3"));
  assert.ok(overdue.includes("₦50,000"));
  const notYet = reminderMessage({ customer: "Jumia", id: "INV-1043", balance: 50000, url: "u", overdueDays: 0 });
  assert.ok(!notYet.toLowerCase().includes("overdue"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --env-file=.env.local --test lib/share.test.ts`
Expected: FAIL — `./share.ts` cannot be found / exports missing.

- [ ] **Step 3: Implement `lib/share.ts`**

Create `lib/share.ts`:

```ts
// Pure share-message helpers. WhatsApp is the operating system of Nigerian SME commerce — a "Share on
// WhatsApp" deep link needs no API key or approval (wa.me opens the chat picker with prefilled text).
import { NGN } from "./format";

/** wa.me deep link with prefilled, url-encoded text. No recipient number → opens the contact picker. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** First-send message: here is your invoice + the dedicated pay link. */
export function payMessage(o: { customer: string; id: string; amount: number; url: string }): string {
  return `Hi ${o.customer}, here's your invoice ${o.id} for ${NGN(o.amount)}. ` +
    `Pay from any bank to a dedicated account here: ${o.url}`;
}

/** Follow-up nudge: polite when not yet due, firmer (names the days) once overdue. */
export function reminderMessage(o: { customer: string; id: string; balance: number; url: string; overdueDays: number }): string {
  const lead = o.overdueDays > 0
    ? `a quick reminder that invoice ${o.id} is now ${o.overdueDays} day${o.overdueDays === 1 ? "" : "s"} overdue`
    : `a quick reminder about invoice ${o.id}`;
  return `Hi ${o.customer}, ${lead}. Balance due: ${NGN(o.balance)}. Pay from any bank here: ${o.url}`;
}
```

- [ ] **Step 4: Register the test file in `package.json`**

In `package.json`, the `test` script lists files explicitly. Add `lib/share.test.ts` to the end of that list (before the closing quote), e.g. `… lib/tenant.test.ts lib/share.test.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --env-file=.env.local --test lib/share.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Add a WhatsApp share to the invoice drawer**

In `app/app/invoices/page.tsx`, add to the imports at the top:

```ts
import { whatsappShareUrl, payMessage } from "@/lib/share";
```

Inside `InvoiceDrawer`, within the `dr-share` block's button group (the `<div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>` that holds "Open ↗" / "Copy link"), add as the first child a WhatsApp link:

```tsx
              <a className="copy" target="_blank" rel="noopener noreferrer"
                href={whatsappShareUrl(payMessage({
                  customer: shortName(invoice.customer),
                  id: invoice.id,
                  amount: invoice.amount,
                  url: typeof window !== "undefined" ? `${window.location.origin}/pay/${invoice.payToken}` : `/pay/${invoice.payToken}`,
                }))}
                title="Share this invoice and pay link on WhatsApp">↗ WhatsApp</a>
```

- [ ] **Step 7: Add a WhatsApp share to the New-invoice success screen**

In the `NewInvoiceModal` success block (`created` branch), in the `<div className="row" …>` action row, add before the "Done" button:

```tsx
              {created.payToken && (
                <a className="ghost" target="_blank" rel="noopener noreferrer"
                  href={whatsappShareUrl(payMessage({
                    customer: shortName(created.customer),
                    id: created.id,
                    amount: created.amount,
                    url: `${window.location.origin}/pay/${created.payToken}`,
                  }))}>↗ Send on WhatsApp</a>
              )}
```

- [ ] **Step 8: Add a WhatsApp share to the payer page**

In `app/pay/[token]/page.tsx`, this is a server component — build the URL inline (do NOT import the client-safe helper into a place that needs `window`; `whatsappShareUrl`/`payMessage` are pure and server-safe). Add the imports:

```ts
import { headers } from "next/headers";
import { whatsappShareUrl, payMessage } from "@/lib/share";
```

After `const qr = await qrSvg(...)` (line ~39), add:

```ts
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "paidup.site"}`;
  const waUrl = whatsappShareUrl(payMessage({ customer: inv.customer, id: inv.id, amount: remaining || inv.amount, url: `${origin}/pay/${inv.payToken}` }));
```

Inside the unpaid `<>` branch, after the `pay-qr` block, add a share row:

```tsx
            <a className="copy" style={{ display: "inline-block", marginTop: 8 }} target="_blank" rel="noopener noreferrer" href={waUrl}>↗ Share this on WhatsApp</a>
```

- [ ] **Step 9: Full suite green + browser check**

Run: `npm test` → Expected: PASS, count is now `N` (from Task 0) `+ 3`.
Browser: open a fresh invoice's drawer → "↗ WhatsApp" opens `wa.me` with a message naming the customer, invoice, amount, and the absolute pay link. Create a new invoice → success screen shows "↗ Send on WhatsApp". Open `/pay/<token>` for an unpaid invoice → "↗ Share this on WhatsApp" present with the absolute origin URL.

- [ ] **Step 10: Commit**

```bash
git add lib/share.ts lib/share.test.ts package.json app/app/invoices/page.tsx app/pay/[token]/page.tsx
git commit -m "feat(share): WhatsApp share of invoices + pay links (merchant drawer, new-invoice, payer page)"
```

---

## Task 3: Due dates + overdue + one-click reminder

**Files:**
- Create: `lib/due.ts`
- Create: `lib/due.test.ts`
- Modify: `package.json`
- Modify: `lib/types.ts`
- Modify: `app/api/invoices/route.ts`
- Modify: `lib/store.ts` (`createInvoice`)
- Test: `lib/store.test.ts` (add a dueDate-persistence case)
- Modify: `app/app/invoices/page.tsx` (overdue label + reminder button + due-date input)

**Interfaces:**
- Consumes: `whatsappShareUrl`, `reminderMessage` (Task 2); `NGN` (format).
- Produces:
  - `dueMeta(dueDate: string | undefined, now?: number) => { label: string; overdue: boolean; days: number }` (pure, `lib/due.ts`).
  - `Invoice.dueDate?: string` (ISO) in `lib/types.ts`.
  - `createInvoice` accepts optional `dueDate: string` and persists it + a derived `dueLabel`.

- [ ] **Step 1: Write the failing test for `dueMeta`**

Create `lib/due.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueMeta } from "./due.ts";

const NOW = Date.parse("2026-07-06T12:00:00Z");
const daysFromNow = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

test("future due date → 'Due in Nd', not overdue", () => {
  assert.deepEqual(dueMeta(daysFromNow(7), NOW), { label: "Due in 7d", overdue: false, days: 7 });
});

test("past due date → 'Overdue by Nd', overdue true", () => {
  assert.deepEqual(dueMeta(daysFromNow(-3), NOW), { label: "Overdue by 3d", overdue: true, days: -3 });
});

test("due today → 'Due today', not overdue", () => {
  assert.deepEqual(dueMeta(daysFromNow(0), NOW), { label: "Due today", overdue: false, days: 0 });
});

test("missing or invalid date → empty label, not overdue", () => {
  assert.deepEqual(dueMeta(undefined, NOW), { label: "", overdue: false, days: 0 });
  assert.deepEqual(dueMeta("not-a-date", NOW), { label: "", overdue: false, days: 0 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --env-file=.env.local --test lib/due.test.ts`
Expected: FAIL — `./due.ts` not found.

- [ ] **Step 3: Implement `lib/due.ts`**

Create `lib/due.ts`:

```ts
// Pure due-date presentation. Client-safe (Date only). Turns an ISO due date into a human label + an
// overdue flag so the invoices table and the reminder message agree on one source of truth.
export interface DueMeta { label: string; overdue: boolean; days: number }

export function dueMeta(dueDate: string | undefined, now: number = Date.now()): DueMeta {
  if (!dueDate) return { label: "", overdue: false, days: 0 };
  const t = Date.parse(dueDate);
  if (Number.isNaN(t)) return { label: "", overdue: false, days: 0 };
  const days = Math.round((t - now) / 86_400_000);
  if (days < 0) return { label: `Overdue by ${-days}d`, overdue: true, days };
  if (days === 0) return { label: "Due today", overdue: false, days };
  return { label: `Due in ${days}d`, overdue: false, days };
}
```

- [ ] **Step 4: Register the test file + run it green**

Add `lib/due.test.ts` to the `test` script list in `package.json`.
Run: `node --env-file=.env.local --test lib/due.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Add `dueDate` to the Invoice type**

In `lib/types.ts`, in the `Invoice` interface, add after `dueLabel?: string;`:

```ts
  dueDate?: string;          // ISO — when payment is expected; drives overdue detection + reminders
```

- [ ] **Step 6: Write the failing store test for dueDate persistence**

In `lib/store.test.ts`, add (mirror the file's existing helpers/imports; it uses an isolated Mongo test DB with `PAIDUP_NO_SEED=1`):

```ts
test("createInvoice persists dueDate and derives a 'Due in Nd' label", async () => {
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const inv = await createInvoice({
    tenantId: "ten_due", customer: "C", description: "x", amount: 1000,
    acctNumber: "1", acctName: "a", bankName: "b", dueDate: due,
  });
  assert.equal(inv.dueDate, due);
  assert.match(inv.dueLabel ?? "", /Due in \d+d|Due today/);
});
```

Ensure `createInvoice` is imported in `lib/store.test.ts` (add it to the existing store import if absent).

- [ ] **Step 7: Run the store test to verify it fails**

Run: `node --env-file=.env.local --test lib/store.test.ts`
Expected: FAIL — `createInvoice` rejects/ignores `dueDate` (type error or `inv.dueDate` undefined).

- [ ] **Step 8: Thread `dueDate` through `createInvoice`**

In `lib/store.ts`, add `dueMeta` import at the top:

```ts
import { dueMeta } from "./due.ts";
```

In `CreateInvoiceInput` add:

```ts
  dueDate?: string;
```

In `createInvoice`, replace the invoice literal's `dueLabel: "Due in 7d",` with a derived label, and persist `dueDate`. Change the object construction so it reads:

```ts
    const dueDate = input.dueDate;
    const label = dueDate ? (dueMeta(dueDate).label || "Due in 7d") : "Due in 7d";
    const invoice: Invoice = {
      id, tenantId: input.tenantId, customer: input.customer, description: input.description, amount: input.amount,
      paid: 0, status: "awaiting", createdAt: new Date().toISOString(), dueLabel: label,
      acctNumber: input.acctNumber, acctName: input.acctName, bankName: input.bankName, payments: [],
      ...(dueDate ? { dueDate } : {}),
      ...(input.lineItems && input.lineItems.length ? { lineItems: input.lineItems } : {}),
      ...(input.vaLive ? { vaLive: true } : {}),
      payToken: `pay_${crypto.randomBytes(9).toString("hex")}`,
    };
```

- [ ] **Step 9: Run the store test to verify it passes**

Run: `node --env-file=.env.local --test lib/store.test.ts`
Expected: PASS (including the new dueDate case; all prior cases still green).

- [ ] **Step 10: Accept `dueDate` in the invoices POST route**

In `app/api/invoices/route.ts`, extend the destructured body type to include `dueDate?: unknown`, then validate it after `customer` is parsed and before `createInvoice`. Add:

```ts
  // Optional due date: accept an ISO date string; reject anything unparseable. Default handled in store.
  let dueDate: string | undefined;
  if (body.dueDate != null && body.dueDate !== "") {
    if (typeof body.dueDate !== "string" || Number.isNaN(Date.parse(body.dueDate))) {
      return NextResponse.json({ error: "dueDate must be a valid date" }, { status: 400 });
    }
    dueDate = new Date(body.dueDate).toISOString();
  }
```

Then pass it into the `createInvoice({ … })` call by adding `dueDate,` to the argument object.

- [ ] **Step 11: Add a due-date input to the New-invoice modal**

In `app/app/invoices/page.tsx`, in `NewInvoiceModal`, add state:

```ts
  const [dueDate, setDueDate] = useState("");
```

Add a field after the customer input (before the items block):

```tsx
            <label htmlFor="ni-due">Due date (optional)</label>
            <input id="ni-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
```

In the `submit` fetch body, include it:

```ts
      body: JSON.stringify({ customer, items: clean, dueDate: dueDate || undefined }),
```

- [ ] **Step 12: Show overdue status + a reminder button in the table and drawer**

In `app/app/invoices/page.tsx`, add imports:

```ts
import { dueMeta } from "@/lib/due";
import { whatsappShareUrl, reminderMessage } from "@/lib/share";
```

In the table row's customer cell, replace `<small>{i.dueLabel}</small>` with an overdue-aware label:

```tsx
                    {(() => { const dm = dueMeta(i.dueDate); const txt = dm.label || i.dueLabel || ""; return <small style={dm.overdue ? { color: "var(--attn)", fontWeight: 600 } : undefined}>{txt}</small>; })()}
```

In `InvoiceDrawer`, inside the `dr-share` button group, add a reminder link shown only when there is a balance (unpaid/partial):

```tsx
              {invoice.paid < invoice.amount && (
                <a className="copy" target="_blank" rel="noopener noreferrer"
                  href={whatsappShareUrl(reminderMessage({
                    customer: shortName(invoice.customer),
                    id: invoice.id,
                    balance: Math.max(Math.round((invoice.amount - invoice.paid) * 100) / 100, 0),
                    url: typeof window !== "undefined" ? `${window.location.origin}/pay/${invoice.payToken}` : `/pay/${invoice.payToken}`,
                    overdueDays: Math.max(0, -dueMeta(invoice.dueDate).days),
                  }))}
                  title="Send a payment reminder on WhatsApp">⏰ Reminder</a>
              )}
```

- [ ] **Step 13: Full suite + browser check**

Run: `npm test` → Expected: PASS (`N + 3 + 4 + 1` new cases).
Browser: create an invoice with a due date 5 days out → row shows "Due in 5d". Create one dated in the past → row shows "Overdue by Nd" in attention colour. Open an unpaid invoice's drawer → "⏰ Reminder" opens WhatsApp with the overdue/balance message.

- [ ] **Step 14: Commit**

```bash
git add lib/due.ts lib/due.test.ts package.json lib/types.ts app/api/invoices/route.ts lib/store.ts lib/store.test.ts app/app/invoices/page.tsx
git commit -m "feat(invoices): due dates, overdue detection, one-click WhatsApp reminders"
```

---

## Task 4: Live "Payment received" flip on the pay page

**Files:**
- Create: `app/api/pay-status/[token]/route.ts`
- Modify: `middleware.ts` (allowlist the public status route)
- Create: `app/pay/[token]/PayStatusPoller.tsx`
- Modify: `app/pay/[token]/page.tsx` (mount the poller when unpaid)

**Interfaces:**
- Consumes: `getInvoiceByToken(token)` (store).
- Produces: `GET /api/pay-status/<token> => { status, paid, amount, isPaid }` (public, read-only). `<PayStatusPoller token wasPaid />` client component that calls `router.refresh()` on transition to paid.

- [ ] **Step 1: Create the public status endpoint**

Create `app/api/pay-status/[token]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getInvoiceByToken } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public, read-only payment status by pay token — powers the live "Payment received" flip on the pay
// page. Exposes ONLY payer-relevant fields (never the rest of the ledger). Reached by unguessable token.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const inv = await getInvoiceByToken(params.token);
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const isPaid = inv.status === "paid" || inv.status === "overpaid" || inv.paid >= inv.amount;
  return NextResponse.json({ status: inv.status, paid: inv.paid, amount: inv.amount, isPaid });
}
```

- [ ] **Step 2: Allowlist the route as public in middleware**

In `middleware.ts`, add `/api/pay-status` to the `PUBLIC_API` array:

```ts
const PUBLIC_API = ["/api/webhook", "/api/login", "/api/signup", "/api/logout", "/api/pay-status"];
```

- [ ] **Step 3: Verify the endpoint is reachable while logged OUT**

Run (PowerShell), replacing `<token>` with a real unpaid invoice's pay token:
```
curl.exe -s http://localhost:3100/api/pay-status/<token>
```
Expected: `{"status":"awaiting","paid":0,"amount":...,"isPaid":false}` with NO cookie sent (proves it's public). A bad token → `{"error":"not found"}` (404).

- [ ] **Step 4: Create the poller client component**

Create `app/pay/[token]/PayStatusPoller.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Polls the public status endpoint while the invoice is unpaid. The instant it flips to paid, refresh
// the server component so the page re-renders its "✓ Payment received" state — no manual reload. This
// is the demo money-shot: real transfer lands → the customer's own screen confirms within seconds.
export function PayStatusPoller({ token }: { token: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (done.current) return;
      try {
        const r = await fetch(`/api/pay-status/${token}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (j.isPaid) { done.current = true; clearInterval(id); router.refresh(); }
      } catch { /* transient — keep polling */ }
    }, 4000);
    return () => clearInterval(id);
  }, [token, router]);
  return null;
}
```

- [ ] **Step 5: Mount the poller on the pay page (only when unpaid)**

In `app/pay/[token]/page.tsx`, add the import:

```ts
import { PayStatusPoller } from "./PayStatusPoller";
```

Inside the unpaid `<>` branch (the `!isPaid` side), add at the end of the fragment (after the share link from Task 2, before the closing `</>`):

```tsx
            <p className="pay-listening" style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>
              <span className="live-dot" aria-hidden="true" /> Waiting for your transfer — this page updates itself the moment it lands.
            </p>
            <PayStatusPoller token={inv.payToken!} />
```

(If `inv.payToken` is possibly undefined for legacy rows, guard the mount: `{inv.payToken && <PayStatusPoller token={inv.payToken} />}` and render the "Waiting…" line unconditionally.)

- [ ] **Step 6: Verify the live flip end-to-end**

- Open `/pay/<token>` for an unpaid invoice in a browser (stay logged out).
- In another shell, simulate the payment against that invoice with the signed-webhook script (production-safe local proof): `node scripts/send-signed-webhook.mjs http://localhost:3100/api/webhook <INV-ID> <amount>` (set `NOMBA_WEBHOOK_SECRET` in env as documented).
- Within ~4s the pay page should flip to "✓ Payment received" WITHOUT a manual reload.

- [ ] **Step 7: Commit**

```bash
git add app/api/pay-status/[token]/route.ts middleware.ts app/pay/[token]/PayStatusPoller.tsx app/pay/[token]/page.tsx
git commit -m "feat(pay): live 'Payment received' flip on the customer pay page (webhook-native)"
```

---

## Task 5: "Verify with the bank network" requery (LAST — money-path-adjacent, contract must be verified first)

**Files:**
- Modify: `lib/types.ts` (`sessionId` on webhook tx, `Payment`, `IncomingPayment`)
- Modify: `app/api/webhook/route.ts` (pass `sessionId`)
- Modify: `lib/store.ts` (`applyPayment` persists `sessionId`; add read-only `findTenantPayment`)
- Test: `lib/store.test.ts` (sessionId persisted + `findTenantPayment` scoping)
- Modify: `lib/nomba.ts` (add `requery`)
- Create: `app/api/requery/route.ts`
- Modify: `app/app/invoices/page.tsx` (drawer "Verify with bank network" button)

**Interfaces:**
- Produces:
  - `Payment.sessionId?: string`, `IncomingPayment.sessionId?: string`, webhook `transaction.sessionId?: string`.
  - `findTenantPayment(tenantId, transactionId) => Promise<{ invoiceId: string; sessionId?: string; amount: number; time: string; outcome: string } | null>` (store, read-only, tenant-scoped).
  - `requery(sessionId: string) => Promise<any>` (`lib/nomba.ts`).
  - `POST /api/requery { transactionId } => { ledger, nomba }` (authed, read-only).

- [ ] **Step 1: VERIFY the requery contract before writing any code**

Read `C:\Users\owen\Downloads\paidup-nomba\NOMBA-API-REFERENCE.md` and confirm: (a) the exact requery path (expected `GET /v1/transactions/requery/{sessionId}`), (b) the success envelope (`code === "00"` vs an alternate like `"200"`), (c) the response `data` shape, and (d) that `payment_success` webhooks actually carry a `sessionId` on `data.transaction`. If the reference is ambiguous, probe live against a known recent sessionId (production creds in `.env.local`) via a throwaway node script before proceeding. **If the contract cannot be confirmed, STOP and report — do not ship a guessed money-path-adjacent endpoint.** Record the confirmed path/envelope/shape here.

- [ ] **Step 2: Add `sessionId` to the types**

In `lib/types.ts`:
- In `NombaPaymentWebhook.data.transaction`, add `sessionId?: string;`.
- In `Payment`, add `sessionId?: string;`.
- In `IncomingPayment` (defined in `lib/store.ts`, not types.ts — see next step), add there.

- [ ] **Step 3: Persist `sessionId` through `applyPayment`**

In `lib/store.ts`:
- In the `IncomingPayment` interface, add `sessionId?: string;`.
- In `applyPayment`, in the `payment: Payment = { … }` object, add `sessionId: p.sessionId,`.

In `app/api/webhook/route.ts`, in the `applyPayment({ … })` call, add `sessionId: t.sessionId,`.

- [ ] **Step 4: Write the failing store test for persistence + lookup**

In `lib/tenant.test.ts` (has isolated tenants + `applyPayment`), add:

```ts
test("sessionId is persisted and findTenantPayment is tenant-scoped", async () => {
  const { a, b } = await fixture();
  await applyPayment({ transactionId: "tx_sess", aliasAccountReference: a.id, amount: 1000, sender: "A", sessionId: "SESS-123" });
  const found = await findTenantPayment("ten_a", "tx_sess");
  assert.equal(found?.sessionId, "SESS-123");
  assert.equal(found?.invoiceId, a.id);
  assert.equal(await findTenantPayment("ten_b", "tx_sess"), null); // B cannot see A's payment
});
```

Add `findTenantPayment` to the store import in `lib/tenant.test.ts`.

- [ ] **Step 5: Run to verify it fails**

Run: `node --env-file=.env.local --test lib/tenant.test.ts`
Expected: FAIL — `findTenantPayment` not exported (and/or `sessionId` undefined).

- [ ] **Step 6: Implement `findTenantPayment` in `lib/store.ts`**

Add (read-only, near the other reads):

```ts
/** Find a single payment (by transactionId) within a tenant's invoices — read-only, for requery. */
export async function findTenantPayment(tenantId: string, transactionId: string):
  Promise<{ invoiceId: string; sessionId?: string; amount: number; time: string; outcome: string } | null> {
  const c = await ready();
  const inv = await c.invoices.findOne({ tenantId, "payments.transactionId": transactionId }, NO_ID);
  if (!inv) return null;
  const p = inv.payments.find((x) => x.transactionId === transactionId);
  if (!p) return null;
  return { invoiceId: inv.id, sessionId: p.sessionId, amount: p.amount, time: p.time, outcome: p.outcome };
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `node --env-file=.env.local --test lib/tenant.test.ts`
Expected: PASS (new case + all prior tenant-isolation cases green).

- [ ] **Step 8: Add `requery` to the Nomba client**

In `lib/nomba.ts`, using the path/envelope CONFIRMED in Step 1 (below assumes `GET /v1/transactions/requery/{sessionId}`, envelope `code === "00"`; adjust to match Step 1):

```ts
/**
 * Requery the bank-network record for a settled transfer by its sessionId — the authoritative
 * second source PaidUp checks against its own ledger. Read-only; never mutates money.
 */
export async function requery(sessionId: string): Promise<any> {
  const j = await authed(`/v1/transactions/requery/${encodeURIComponent(sessionId)}`, { method: "GET" });
  if (j.code !== "00") throw new Error(`Requery failed: [${j.code}] ${j.description}`);
  return j.data;
}
```

- [ ] **Step 9: Create the authed requery route**

Create `app/api/requery/route.ts`:

```ts
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
```

- [ ] **Step 10: Add the "Verify with bank network" button to the drawer timeline**

In `app/app/invoices/page.tsx`, inside `InvoiceDrawer`, add state near the other drawer state:

```ts
  const [verifyTx, setVerifyTx] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, string>>({});
  const verify = async (tx: string) => {
    setVerifyTx(tx);
    try {
      const r = await fetch("/api/requery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: tx }) });
      const j = await r.json().catch(() => null);
      setVerifyResult((m) => ({ ...m, [tx]: r.ok ? "✓ Confirmed by the bank network" : (j?.error || "Couldn't verify") }));
    } catch { setVerifyResult((m) => ({ ...m, [tx]: "Network error — try again" })); }
    setVerifyTx(null);
  };
```

In the payment timeline `.map((p) => …)`, inside each `tl-body`, after the narration line, add:

```tsx
                <div style={{ marginTop: 6 }}>
                  <button className="ghost sm" onClick={() => verify(p.transactionId)} disabled={verifyTx === p.transactionId}>
                    {verifyTx === p.transactionId ? "Verifying…" : "🛰 Verify with bank network"}
                  </button>
                  {verifyResult[p.transactionId] && <span className="qai-note" style={{ marginLeft: 8 }}>{verifyResult[p.transactionId]}</span>}
                </div>
```

- [ ] **Step 11: Full suite + typecheck + browser check**

Run: `npx tsc --noEmit` → Expected: clean.
Run: `npm test` → Expected: PASS (all counts).
Browser: open an invoice with a real (production-webhook) payment that has a sessionId → the timeline shows "🛰 Verify with bank network"; clicking it returns "✓ Confirmed by the bank network". A payment with no sessionId returns the 422 message.

- [ ] **Step 12: Commit**

```bash
git add lib/types.ts app/api/webhook/route.ts lib/store.ts lib/tenant.test.ts lib/nomba.ts app/api/requery/route.ts app/app/invoices/page.tsx
git commit -m "feat(reconcile): requery a payment against Nomba's bank-network record (read-only verify)"
```

---

## Task 6: Integration verification (whole plan)

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: PASS. Count = original `N` + new cases (receipt +2, share +3, due +4, store/tenant +2 ≈ `N + 11`).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; the new routes (`/pay/[token]/verify`, `/api/pay-status/[token]`, `/api/requery`) appear in the route manifest. (Do NOT run this against a live `npm run dev` — it corrupts the dev `.next`; stop dev first.)

- [ ] **Step 4: Mobile smoke of the payer surfaces**

At 390px width (Playwright or devtools), open `/pay/<token>` (unpaid) and `/pay/<token>/verify` and `/pay/<token>/receipt` — confirm the WhatsApp share, the "Waiting for your transfer" line, the verification QR, and the verified state all render without overflow.

- [ ] **Step 5: Final commit if anything was fixed during verification**

```bash
git add -A
git commit -m "chore: final-submission edge features — integration verification fixes"
```

---

## Notes on sequencing, risk, and what's OUT of scope

- **Cut-from-the-bottom:** ship order is Task 0 → 1 → 2 → 3 → 4 → 5. If time runs short, drop from Task 5 upward. 0+1+2 alone is a coherent, shippable improvement.
- **Task 5 is gated on Step 1 (contract verification).** It is the only money-path-adjacent task; if the requery contract can't be confirmed against `NOMBA-API-REFERENCE.md` or a live probe, drop the whole task — the rest of the plan is independent of it.
- **Deliberately excluded** (from the research, over budget or over risk 24h out): payout lifecycle webhooks (mutates withdrawal money-state), card checkout, recurring invoices, per-tenant sub-accounts, accounting exports, USSD/WhatsApp Business API, password reset, integer-kobo refactor.
- **Prerequisite ops (handled separately, not in this plan):** production deploy + MongoDB cutover (the store is already Mongo locally; production must be migrated), and the catch-up commit series / push to `paidup-app`. These are ops, not feature work — do them around this plan, and re-prove the real-money loop after deploy.
