# CLAUDE.md

Guidance for working in this repo. **PaidUp** — SME per-invoice reconciliation on Nomba.
Hackathon MVP (Cresiolabs · Nomba x DevCareer 2026). Focus: **Virtual Accounts as Infrastructure**.

## The one-line product
Create an invoice → it gets its own Nomba virtual account → customer transfers from any bank →
`payment_success` webhook → matched by `aliasAccountReference` → the reconcile engine marks it
**paid / partial / overpaid / reversed / unmatched**, live, with zero manual matching.

## Commands
```bash
npm run dev        # http://localhost:3100  (start at / and click "Get started")
npm run build      # production build (must stay green)
npm start          # prod server on :3100 (webhook fails CLOSED; simulate disabled)
npm test           # node --test over the lib/*.test.ts unit suite (the judged core)
npm run test:e2e   # next build && playwright (e2e/)
```
Run a single unit test file: `node --test lib/reconcile.test.ts`.

## Stack
Next.js 14.2 (App Router) · React 18 · TypeScript 5.5 · GSAP (landing motion) · qrcode (pay links).
No DB driver — the ledger is a file-backed store (`lib/store.ts` → `.data/ledger.json`).

## Architecture (where things live)
```
middleware.ts          fail-closed auth gate over /app + /get-started + /api (public: webhook, login, signup, logout) — SESSION_SECRET
app/
  page.tsx             Marketing landing (entry/story)
  get-started/         Onboarding wizard + "arming the engine" processing sequence (post-signup)
  login/               Email + password sign-in
  signup/              Self-serve signup → isolated tenant workspace
  pay/                 Customer-facing pay page (QR / VA details)
  app/                 The product: live feed (page.tsx) + invoices workspace
  api/
    invoices/  POST create (provisions VA) · GET list
    webhook/   Nomba payment_success + payment_reversal: verify HMAC → dedupe → match → reconcile
    events/    polled ~2s by the dashboard (feed + invoices + KPIs + suggestions + anomalies)
    refund/    overpayment refund → /v2/transfers/bank (stable idempotency key)
    quarantine/ resolve unmatched payment: assign-to-invoice | bounce-to-sender
    sync/      reconciliation backstop: requery Nomba + re-run reconcile (idempotent)
    export/    audit-grade CSV: full ledger | per-invoice statement
    resolve/ explain/ summary/   on-demand AI (MiniMax), each grounded + with deterministic fallback
    login/ signup/ logout/       scrypt verify → signed session cookie · tenant+owner mint · clear cookie
    account/   settings: GET profile · POST rename | password (rotates tokenVersion, re-mints this
               cookie) | clear-data · DELETE account — demo tenant + in-flight payouts refuse wipes
    simulate/                    demo driver (gated out of prod)
lib/
  reconcile.ts   classify() + reverse() + statusFor() — the judged core; pure, tested
  verify.ts      9-field HMAC-SHA256 signature check (matches Nomba docs vector)
  resolver.ts    smart unmatched-payment scorer + aiResolve() (grounded)
  anomaly.ts     fraud/anomaly flags + explainAnomalies()
  summary.ts     snapshot() + templatedSummary() (fallback) + aiSummary()
  ai.ts          MiniMax client — returns null on ANY failure so callers fall back (the AI seam)
  nomba.ts       token (cached) · createVirtualAccount · getVirtualAccountTransactions · transferToBank
  store.ts       MongoDB-backed MULTI-TENANT ledger — transactional money path, async API (db.ts = connection/indexes)
  auth.ts        stateless HMAC-signed session tokens (edge-safe Web Crypto; SESSION_SECRET)
  password.ts    scrypt hashing · session.ts  node-side session resolution (tokenVersion revocation)
  ratelimit.ts validate.ts audit.ts receipt.ts qr.ts export.ts format.ts types.ts
```

## Working rules (read before editing)
- **The money path is sacred.** `lib/reconcile.ts` and `lib/verify.ts` are the scored core — pure,
  fully unit-tested. Any change here must keep `npm test` green and preserve: exact→paid, under→partial
  (accumulates), over→overpaid (refundable surplus), `payment_reversal`→un-reconcile, kobo-tolerance,
  and **rejection of NaN/invalid** (never corrupt the ledger).
- **HMAC verification must keep matching the Nomba docs test vector** — it's a scored security criterion.
  The signature is HMAC-SHA256 over a colon-joined string of **9 fields**, NOT the raw body.
- **AI must never endanger the money path.** `lib/ai.ts` returns `null` on missing key / HTTP error /
  non-zero status / 8s timeout / unparseable JSON; every AI feature degrades to its deterministic engine.
  AI is on-demand only (never on the 2s poll). AI suggests — the human confirms.
- **No secrets in git.** Credentials live only in `.env.local` / host env (gitignored).
- **Auth is multi-tenant (2026-07-03).** Every ledger record carries a `tenantId`; every API route
  resolves the session via `requireSession()` and scopes reads/mutations to `session.tid`. The webhook
  stays global (routes by `aliasAccountReference` → invoice → its tenant; unmatched → demo tenant).
  Demo workspace login: `demo@paidup.app` / `LedgerDemo2026` (`DEMO_PASSWORD` overrides). `.env.local`
  needs `SESSION_SECRET`. Isolation is tested in `lib/tenant.test.ts` — keep it green.
- **Design = "The Ledger"** (editorial financial print). All tokens are CSS variables in `app/globals.css`.
  Fraunces (display) + Hanken Grotesk (body) + JetBrains Mono (figures). Don't introduce the generic dark dashboard look.

## Nomba integration notes (source of truth for `lib/nomba.ts` / `lib/verify.ts`)
Key facts the integration is built on — consult before changing `lib/nomba.ts` or `lib/verify.ts`:
- Webhook signature is the **9-field colon-joined HMAC-SHA256** (not the raw body) — matches the Nomba docs vector.
- Transfers are on **`/v2`** (`/v2/transfers/bank`).
- Setting `expectedAmount` on a VA makes the sender's bank reject mismatched transfers — so leave it unset
  and track expected amounts in our own ledger.

## In-repo docs
- `README.md` — full run/architecture/what's-wired writeup.
- `SECURITY.md` — security & reliability note (submission requirement).
- `DEMO.md` — timed 2–3 min demo script mapped to the judging rubric.
- `GAPS.md` — rubric audit + hardening-loop changelog (and deliberately deferred items).

## Known limits
- File-backed store survives restarts on a single instance, **not serverless** — swap for Postgres/Redis before a Vercel deploy.
- VA creation is mocked by default (keeps the demo independent of a live API call — the old sandbox 2-VA cap is now removed for hackathon accounts); pass `useNomba:true` on New Invoice to create a real sandbox VA.
- Money is held as Naira floats with round-2 + kobo-tolerance guards at every arithmetic point (integer-kobo refactor deferred — see GAPS.md).

## Local dev notes
- **Prove the loop locally:** `NOMBA_WEBHOOK_SECRET=<key> node scripts/send-signed-webhook.mjs <url> INV-1044 75500` → real 9-field HMAC → reconcile.
- **`.next` cache collisions:** running `npm run build` while `npm run dev` is up corrupts the dev `.next` (symptoms: `/` 500s, `Cannot find module './948.js'`). Fix: kill dev, `rm -rf .next`, restart `npm run dev`. Don't build against a live dev server.
