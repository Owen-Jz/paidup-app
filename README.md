# PaidUp — SME Per-Invoice reconciliation on Nomba

Hackathon MVP (Cresiolabs · Nomba x DevCareer 2026). **Focus: Virtual Accounts as Infrastructure.**

> Create an invoice → it gets its own Nomba virtual account → customer transfers from any bank →
> `payment_success` webhook → matched by `aliasAccountReference` → reconcile engine marks it
> **paid / partial / overpaid / unmatched**, live. Zero manual matching.

## Run
```bash
cd paidup
npm install
cp .env.local.example .env.local   # already filled with TEST creds if you copied from smoke-test/.env
npm run dev                         # http://localhost:3100  (start at / and click Get started)
```
- **/** — Marketing landing (the entry / story). CTA → Get started.
- **/get-started** — Onboarding: business → connect Nomba → first invoice → an "arming the engine" processing sequence → dashboard.
- **/app** — Live collections feed (the demo "wow": watch money land + auto-reconcile).
- **/app/invoices** — Invoice workspace: KPI strip + filterable table, per-invoice virtual account, New Invoice.
📹 **Recording the demo video?** Follow **DEMO.md** — a timed 2–3 min script mapped to the judging rubric.

## Design
Aesthetic: **"The Ledger"** — editorial financial print. Warm paper/cream, ink black, emerald money accent;
**Fraunces** (display) + **Hanken Grotesk** (body) + **JetBrains Mono** (figures). Intentionally light + serif,
not the generic dark-dashboard look. All design tokens are CSS variables in `app/globals.css`.

## Architecture
```
middleware.ts           fail-closed auth gate over /app + /get-started + /api (public: webhook, login, signup, logout)
app/
  page.tsx              Marketing landing
  get-started/page.tsx  Onboarding wizard + processing/arming sequence (post-signup first-invoice flow)
  login/page.tsx        Email + password sign-in
  signup/page.tsx       Self-serve signup -> isolated tenant workspace
  app/
    layout.tsx          App chrome (header + nav)
    page.tsx            Live feed
    invoices/page.tsx   Invoice workspace (statement drawer, quarantine queue, flags)
    withdraw/page.tsx   Payout to any Nigerian bank (write-ahead reserve, bank-confirmed recipient name)
    settings/page.tsx   Rename workspace, change password, clear/delete account
    reports/            Printable PDF reports — full ledger (reports/ledger) + per-invoice audit (reports/audit)
  pay/[token]/          Customer-facing pay page (QR / VA details)
    receipt/page.tsx    Printable payer receipt + verification QR
    invoice/page.tsx    Payer invoice PDF
    verify/page.tsx     Public anti-fake-alert payment verification
  api/
    invoices/route.ts   POST create (provisions VA) · GET list
    webhook/route.ts    Nomba webhook: verify HMAC -> dedupe -> match -> reconcile (payment_success + payment_reversal)
    events/route.ts     polled ~2s by the dashboard (feed + invoices + KPIs + suggestions + anomalies)
    refund/route.ts     overpayment refund -> /v2/transfers/bank (stable idempotency key)
    quarantine/route.ts resolve an unmatched payment: assign-to-invoice | bounce-to-sender
    sync/route.ts       reconciliation backstop: requery Nomba + re-run the reconcile path (idempotent)
    export/route.ts     audit-grade CSV: full ledger | per-invoice statement
    resolve/route.ts    AI unmatched-payment resolver (on-demand, MiniMax) -> grounded suggestion
    explain/route.ts    AI anomaly explanations (on-demand, MiniMax) -> per-flag recommended action
    summary/route.ts    AI reconciliation brief (on-demand, MiniMax) over the computed snapshot
    withdraw/route.ts   payout-to-bank with write-ahead reserve + idempotent wd_ refs
    account/route.ts    workspace settings (rename, password change, account deletion)
    audit/route.ts      tamper-evident chain audit (SHA-256 hashEntry/verifyChain)
    flags/route.ts      anomaly-flag manual dismiss
    login/route.ts      email + password (scrypt) -> signed session cookie
    signup/route.ts     business + email + password -> tenant + owner user + session
    logout/route.ts     clears the session cookie
    simulate/route.ts   demo driver (gated out of prod) -> runs the real reconcile/reverse path
lib/
  reconcile.ts          classify() + reverse() + statusFor()  (the judged core; pure, tested)
  verify.ts             9-field HMAC-SHA256 signature check (VERIFIED vs docs vector)
  resolver.ts           smart unmatched-payment matcher (scoring) + aiResolve() (MiniMax, grounded)
  anomaly.ts            fraud/anomaly flags + explainAnomalies() (MiniMax recommendations)
  summary.ts            snapshot() + templatedSummary() (fallback) + aiSummary() (MiniMax brief)
  ai.ts                 MiniMax client — returns null on any failure so callers fall back (the AI seam)
  export.ts             RFC-4180 CSV builders (ledger + statement)
  db.ts                 MongoDB connection + collection/index initialization
  audit.ts              tamper-evident chain — hashEntry / verifyChain / GENESIS / verifyAudit()
  receipt.ts            receiptNumber / receiptHash / paymentSummary (pure, tested)
  qr.ts                 QR code SVG generator (wraps the qrcode dep)
  auth.ts               stateless HMAC-signed session tokens (edge-safe Web Crypto; SESSION_SECRET)
  password.ts           scrypt password hashing (per-user salt, timingSafeEqual)
  session.ts            node-side session resolution (tokenVersion revocation check)
  nomba.ts              token (cached) · createVirtualAccount · getVirtualAccountTransactions · transferToBank
  store.ts              MongoDB-backed MULTI-TENANT ledger — transactional money path (all-or-nothing), unique-index atomic dedupe (lib/db.ts = connection/indexes)
  types.ts / format.ts / ratelimit.ts / validate.ts / anomaly.ts
```

## AI moat (MiniMax, fully optional)
Three AI features sharpen reconciliation without ever endangering the money path:
- **AI unmatched-payment resolver** (`/api/resolve`) — reads a quarantined transfer + the open invoices and
  picks the likely owner with a plain-English reason. **Hard-grounded** (the pick must be a real, still-open
  invoice or it falls back to the deterministic scorer) and **AI only suggests — the human still confirms**.
- **AI anomaly explanations** (`/api/explain`) — turns each deterministic flag into a recommended next action.
- **AI reconciliation brief** (`/api/summary`) — a natural-language read on the whole ledger over the
  **computed** snapshot (the model only sees figures, so it can't invent money).

**The engineering moat is the graceful fallback:** `lib/ai.ts` returns `null` on a missing key, HTTP error,
non-zero MiniMax status, 8s timeout, or unparseable JSON — so every feature degrades to its deterministic
engine and **a missing/rate-limited key never breaks the demo**. AI calls are on-demand (never on the 2s
poll), so they don't re-bill. Set `MINIMAX_API_KEY` to enable; leave blank to run fully deterministic. The
AI seam is injectable, so the resolver/anomaly/summary fallbacks are unit-tested offline (no network/key).

**What's new (shipped since initial build):** withdrawals to bank · account settings · payer receipt + verification · WhatsApp sharing · due-dates & reminders · mobile-responsive UI · MongoDB transactional ledger.

## What's wired & verified  (`npm test` → 136 unit tests; `npm run build` green)
- ✅ **Reconcile engine:** exact→paid, under→partial (accumulates), over→overpaid (refundable surplus),
  **payment_reversal→un-reconcile** (clawback re-derives status), kobo-tolerant, **rejects NaN/invalid**
  (no ledger corruption). Pure + unit-tested incl. the HMAC docs vector.
- ✅ **Webhook:** real Nomba `payment_success` + `payment_reversal`; verifies HMAC + **timestamp freshness**;
  **fails CLOSED in production**; dedupes on `transactionId` (committed only after success); quarantines unmatched refs.
- ✅ **HMAC verification matches the Nomba docs test vector exactly** (the scored security criterion).
- ✅ **Unmatched handling:** quarantine queue with a **smart suggested-match** (one-click Accept) + manual
  **assign-to-invoice** or **bounce-to-sender** (`/v2/transfers/bank`).
- ✅ **Per-invoice statement drawer** (history, running balance, VA + copy) + **one-tap overpayment refund**
  via `/v2/transfers/bank` (lookup → transfer, stable idempotency key). **Note:** Nomba **transfer/refund
  settlement is production-only** — the sandbox does not settle transfers, so this is verified at the call
  path, not at settlement.
- ✅ **Reconciliation backstop:** "Sync from Nomba" requeries recorded credits and re-runs them through the
  same dedupe+reconcile path (idempotent) — never relies on webhooks alone.
- ✅ **Anomaly/fraud flags:** large overpayment, possible duplicate transfer, repeated unmatched sender.
- ✅ **Audit-grade CSV export:** full reconciliation ledger + per-invoice customer statement.
- ✅ **AI moat (MiniMax, optional):** AI unmatched-payment resolver, anomaly explanations, and reconciliation
  brief — each **grounded** (no invented invoice ids/amounts), AI-suggests-human-confirms, and with a
  **deterministic fallback** so a missing/rate-limited key never breaks the demo. See "AI moat" above.
- ✅ **Security — real multi-tenant auth:** self-serve signup, scrypt passwords, stateless HMAC-signed
  session cookies (httpOnly, 8h, revocable via tokenVersion), fail-closed middleware, and **server-side
  tenant isolation on every route** (webhook never gated — it authenticates with its own HMAC).
  Demo workspace: `demo@paidup.app` / `LedgerDemo2026` (see DEMO.md); requires `SESSION_SECRET` in env.
- ✅ **Full VA lifecycle:** create (`POST /v1/accounts/virtual/{subAccountId}`) → reconcile (webhook + requery)
  → **expire on invoice deletion** (`DELETE /v1/accounts/virtual/{ref}` — the NUBAN dies with the reference;
  only clean, never-paid invoices are deletable). Plus a **sub-account balance tie-out**
  (`GET /v1/accounts/{subAccountId}/balance`, operator view): the settled cash at Nomba shown next to the
  ledger's collected total — where every VA credit sweeps.
- ✅ Durable MongoDB ledger — payment/reversal/withdrawal each mutate invoice + feed event + dedupe claim + audit entry atomically in one transaction. `/api/simulate` gated out of production.
- ✅ **Proven with real money on production (2026-07-04):** real bank transfers from OPay → live Nomba VAs →
  real `payment_success` webhooks (HMAC verified) → auto-reconciled **paid / partial / overpaid**, and a real
  **₦100 surplus refund settled** via `/v2/transfers/bank`. Amounts are Naira; balance tie-out matches to the naira.

See **SECURITY.md** for the full security & reliability note (the submission requirement).

> **Demo note:** the hosted demo runs in production mode against the **live Nomba API** — pay a real invoice
> by bank transfer and watch it reconcile. In production (`npm start`) the webhook fails closed without a
> real `NOMBA_WEBHOOK_SECRET`. See `.env.local.example`. Audit + backlog: `GAPS.md`.

## Known limits / next steps
- Store is MongoDB (transactional, multi-instance-safe). VA creation is mocked by default; pass `useNomba:true` for a real sandbox VA. Money is naira floats with round-2 + kobo-tolerance guards (integer-kobo refactor deferred).
- **VA creation defaults to a real Nomba VA with a mock fallback.** On production creds the minted NUBAN is
  reachable from any Nigerian bank app; the mock fallback stays as the safety net so the demo never depends
  on a live API call. (Sandbox VAs are not reachable from real banks — production is the proving ground.)
- **Webhook secret** — set `NOMBA_WEBHOOK_SECRET` to the dashboard signature key to enforce verification
  (blank = dev-open; **production fails closed**). Then expose the app with a tunnel (cloudflared/ngrok) and
  submit the public `/api/webhook` URL + sub-account ID to Nomba's form.
- **Money is held as Naira floats** with round-2 + kobo-tolerance guards at every arithmetic point (tested).
  Integer-kobo end-to-end is the textbook ideal but a large cross-cutting refactor — deliberately deferred
  post-hackathon; the guarded approach is correct for the amounts in play (see GAPS.md, pruned #21).
- The unmatched-payment resolver runs the deterministic, explainable scorer by default and **layers MiniMax
  on top** when `MINIMAX_API_KEY` is set (`/api/resolve`, "Ask AI") — the AI pick is re-validated against
  live ledger state, falling back to the scorer if the key is absent or the answer doesn't ground. Same UX
  contract either way. See "AI moat".
