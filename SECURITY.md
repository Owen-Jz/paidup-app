# PaidUp — Security & Reliability Note

How PaidUp keeps money-state correct and the surface trustworthy. Paired with the architecture
diagram in `README.md`. The two scored axes here are **webhook authenticity** and **reconciliation
integrity** — both are treated as money-correctness problems, not afterthoughts.

## Webhook authenticity (the money entry point)
- **HMAC-SHA256 over the 9-field colon-joined string** `event_type:requestId:userId:walletId:
  transactionId:type:time:responseCode:nomba-timestamp` (base64, case-insensitive compare) — the exact
  scheme from Nomba's docs, **not** an HMAC of the raw body. `lib/verify.ts` reproduces the **docs test
  vector exactly** (unit-tested), so we know the implementation is right, not just plausible.
- **Constant-time comparison** of signatures (no early-exit timing leak).
- **Timestamp freshness** — events older than ±5 min are rejected (`isTimestampFresh`), blunting replay.
- **Fail CLOSED in production** — with `NODE_ENV=production` and no `NOMBA_WEBHOOK_SECRET`, the webhook
  returns `503` (never silently accepts unsigned events). Local demos are dev-open; a hosted demo without
  a real secret must *explicitly* opt in via `ALLOW_UNSIGNED_WEBHOOKS=1`.
- **Input validation at the boundary** — missing `transactionId` or a non-finite/≤0 amount → `400`; the
  reconcile core also throws on invalid inputs, so a malformed webhook can never poison the ledger as `NaN`.

## Reconciliation integrity (the ledger)
- **Idempotent processing** — dedupe on `transactionId`, and the dedupe marker is committed **only after**
  the ledger mutation + event succeed. A mid-flight error returns non-2xx so Nomba's retry is reprocessed,
  never silently dropped or double-counted. (Nomba retries 5× with backoff.)
- **Reversals** — `payment_reversal` un-reconciles: the clawed-back amount is subtracted and status
  re-derived; reversing an already-reversed payment is a no-op.
- **Don't trust webhooks alone** — "Sync from Nomba" requeries the credits Nomba actually recorded
  (`/v1/transactions/virtual`) and re-runs them through the *same* dedupe+reconcile path, repairing the
  ledger if a webhook was ever missed. Safe to run anytime (idempotent).
- **Durable state** — the ledger + processed-tx set are file-backed (`.data/ledger.json`), so a restart
  can't replay-double-credit. (Serverless needs Postgres — see README.)
- **Anomaly flags** — large overpayments, possible duplicate transfers, and repeated unmatched senders are
  surfaced for a human before money is treated as settled.

## Money movement (payouts)
- Refunds/bounces go through **lookup-then-transfer** (`/v1/transfers/bank/lookup` → `/v2/transfers/bank`)
  with a **stable idempotency key** derived from the originating transaction (never `Date.now()`), so a
  retried payout is deduped by Nomba rather than sending twice.

## Access control (multi-tenant auth)
- **Real accounts, isolated workspaces.** Self-serve signup mints a tenant + owner user; every ledger
  record carries a `tenantId` and **every API read/mutation is scoped server-side** to the session's
  tenant — tenant A can never read, credit, refund, or resolve tenant B's money (unit-tested, including
  cross-tenant assign/refund/bounce refusal).
- **Passwords: scrypt** (Node built-in) with a per-user random salt, verified with `timingSafeEqual`.
  Unknown-email logins verify against a decoy hash so there's no user-enumeration timing oracle, and
  the error is the same generic "invalid email or password" either way.
- **Sessions: stateless HMAC-SHA256-signed tokens** (`payload.signature`, payload = `{uid, tid, ver, exp}`,
  8h expiry) signed with `SESSION_SECRET`. The edge middleware verifies signature + expiry with Web
  Crypto (no DB at the edge); the node layer additionally checks the user still exists and the token's
  `ver` matches the stored `tokenVersion` (bumping it revokes all outstanding sessions). Cookies are
  `httpOnly` + `sameSite=lax` + `secure` in production.
- **Fail closed.** `/app`, `/get-started`, and all `/api` routes require a valid session; production
  with no `SESSION_SECRET` refuses requests (503) rather than running an open ledger. Public by design:
  `/api/webhook` (authenticates with its own HMAC), `/api/login` + `/api/signup` (rate-limited:
  8 logins / 5 signups per IP per 15 min), and the unguessable-token customer pay page `/pay/<token>`.

## AI safety (the moat that can't break the money path)
- **AI never moves money and never decides reconciliation.** The MiniMax features (unmatched resolver,
  anomaly explanations, reconciliation brief) only *suggest* and *explain*; a human still confirms every
  assign/refund, and the deterministic engine remains the source of truth.
- **Grounded output.** The resolver may only choose from the open-invoice list and its pick is re-validated
  against live ledger state before we trust it (a hallucinated/closed id → deterministic fallback). The brief
  is generated over *pre-computed* figures, so the model cannot invent amounts.
- **Fails safe, never closed.** `lib/ai.ts` returns `null` on a missing key, HTTP error, non-zero MiniMax
  status, 8s timeout, or unparseable JSON. Every caller then falls back to its deterministic path — a
  missing/rate-limited key degrades quality, never availability. AI calls are on-demand (never on the poll).
- **Key handling.** `MINIMAX_API_KEY` is read from env (gitignored), never committed, and entirely optional.

## Secret handling
- All credentials live in `.env.local` / host env (gitignored). **LIVE keys move real money and are kept
  out of code.** `.env.local.example` documents every variable with no secrets.

## Known limits / threat model
- File store is single-instance; move to Postgres before a serverless deploy.
- Auth v1 defers email verification, password reset, and team members (one owner-user per tenant);
  unmatched money with no attributable tenant lands in the operator (demo) workspace for resolution.
- Money is held as guarded Naira floats (round-2 + kobo tolerance, tested); integer-kobo is the
  post-hackathon hardening step.

## Verification
`npm test` → 123 unit tests (reconcile incl. reversal, HMAC/signature vector, session-token sign/verify/
tamper/expiry, scrypt password hashing, tenant isolation incl. cross-tenant refusal, resolver + AI-fallback,
export, anomaly + AI-explain, summary + AI-fallback, plus ai, validate, store, ratelimit, security-headers,
audit, receipt).
`npm run build` green. Webhook fail-closed, auth 401/200, and reversal flows verified live against
`sandbox.nomba.com`. The refund/transfer path (`/v2/transfers/bank`) is exercised end-to-end, but **actual
refund settlement is production-only** — Nomba's sandbox does not settle transfers/refunds.
