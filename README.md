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
- **⚡ Simulate payment** panel (both app pages) drives the demo without a real bank transfer.

📹 **Recording the demo video?** Follow **DEMO.md** — a timed 2–3 min script mapped to the judging rubric.

## Design
Aesthetic: **"The Ledger"** — editorial financial print. Warm paper/cream, ink black, emerald money accent;
**Fraunces** (display) + **Hanken Grotesk** (body) + **JetBrains Mono** (figures). Intentionally light + serif,
not the generic dark-dashboard look. All design tokens are CSS variables in `app/globals.css`.

## Architecture
```
middleware.ts           opt-in auth gate over /app + /api (skips webhook + login) — APP_PASSWORD
app/
  page.tsx              Marketing landing
  get-started/page.tsx  Onboarding wizard + processing/arming sequence
  login/page.tsx        Shared-password sign-in (only when APP_PASSWORD set)
  app/
    layout.tsx          App chrome (header + nav)
    page.tsx            Live feed
    invoices/page.tsx   Invoice workspace (statement drawer, quarantine queue, flags)
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
    login/route.ts      password -> session cookie
    simulate/route.ts   demo driver (gated out of prod) -> runs the real reconcile/reverse path
lib/
  reconcile.ts          classify() + reverse() + statusFor()  (the judged core; pure, tested)
  verify.ts             9-field HMAC-SHA256 signature check (VERIFIED vs docs vector)
  resolver.ts           smart unmatched-payment matcher (scoring) + aiResolve() (MiniMax, grounded)
  anomaly.ts            fraud/anomaly flags + explainAnomalies() (MiniMax recommendations)
  summary.ts            snapshot() + templatedSummary() (fallback) + aiSummary() (MiniMax brief)
  ai.ts                 MiniMax client — returns null on any failure so callers fall back (the AI seam)
  export.ts             RFC-4180 CSV builders (ledger + statement)
  auth.ts               Web-Crypto session token + constant-time compare
  nomba.ts              token (cached) · createVirtualAccount · getVirtualAccountTransactions · transferToBank
  store.ts              durable file-backed ledger (SWAP for Postgres before serverless deploy)
  types.ts / format.ts
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

## What's wired & verified  (`npm test` → 58 unit tests; `npm run build` green)
- ✅ **Reconcile engine:** exact→paid, under→partial (accumulates), over→overpaid (refundable surplus),
  **payment_reversal→un-reconcile** (clawback re-derives status), kobo-tolerant, **rejects NaN/invalid**
  (no ledger corruption). Pure + unit-tested incl. the HMAC docs vector.
- ✅ **Webhook:** real Nomba `payment_success` + `payment_reversal`; verifies HMAC + **timestamp freshness**;
  **fails CLOSED in production**; dedupes on `transactionId` (committed only after success); quarantines unmatched refs.
- ✅ **HMAC verification matches the Nomba docs test vector exactly** (the scored security criterion).
- ✅ **Unmatched handling:** quarantine queue with a **smart suggested-match** (one-click Accept) + manual
  **assign-to-invoice** or **bounce-to-sender** (`/v2/transfers/bank`).
- ✅ **Per-invoice statement drawer** (history, running balance, VA + copy) + **one-tap overpayment refund**
  (verified `live:true` against sandbox).
- ✅ **Reconciliation backstop:** "Sync from Nomba" requeries recorded credits and re-runs them through the
  same dedupe+reconcile path (idempotent) — never relies on webhooks alone.
- ✅ **Anomaly/fraud flags:** large overpayment, possible duplicate transfer, repeated unmatched sender.
- ✅ **Audit-grade CSV export:** full reconciliation ledger + per-invoice customer statement.
- ✅ **AI moat (MiniMax, optional):** AI unmatched-payment resolver, anomaly explanations, and reconciliation
  brief — each **grounded** (no invented invoice ids/amounts), AI-suggests-human-confirms, and with a
  **deterministic fallback** so a missing/rate-limited key never breaks the demo. See "AI moat" above.
- ✅ **Security:** opt-in `APP_PASSWORD` gate (httpOnly session cookie, constant-time compare; webhook never gated).
- ✅ Durable file-backed ledger (`.data/ledger.json`) so restarts don't replay-double-credit; `/api/simulate` gated out of production.
- ✅ Live token issue + VA create/list + refund + requery against `sandbox.nomba.com`.

See **SECURITY.md** for the full security & reliability note (the submission requirement).

> **Demo note:** run with `npm run dev` so the live-reconcile demo + simulate panel work. In production
> (`npm start`) the webhook fails closed and simulate is disabled unless you set `ALLOW_UNSIGNED_WEBHOOKS=1`
> and `DEMO_MODE=1` (or a real `NOMBA_WEBHOOK_SECRET`). See `.env.local.example`. Audit + backlog: `GAPS.md`.

## Known limits / next steps
- **File-backed store** (`lib/store.ts`, `.data/ledger.json`) survives restarts on a single instance (Render)
  but not serverless (each invocation is isolated). Swap for Postgres/Redis before a Vercel deploy.
- **VA creation is mocked by default** so the demo isn't blocked by the **sandbox 2-VA cap**. Flip `useNomba:true`
  in the New Invoice request to create a real sandbox VA (scoped to the sub-account).
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
