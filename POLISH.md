# POLISH.md — non-AI hardening loop (security · UX/animation · architecture · moat)

**Iteration: 16/20** &nbsp;·&nbsp; **⏹ STOPPED BY USER after it16** (cap not reached). Remaining open: M4 bulk
CSV import (S), docs refresh (README/SECURITY/DEMO), final re-audit + pen-test pass. Resume with `/loop`.

Hard cap 20. Read this counter first each run; at 20, write final summary + STOP.

Scope: the **non-AI** surface of `paidup/`. AI features (resolver, anomaly explain, reconciliation
brief) are DONE — do not extend; only touch AI code to keep it building/secure.

Weighting (highest first): **Security/Reliability** > Product UX & Clarity (incl. animation) ≈
Technical Execution (incl. architecture) > Nomba Integration Depth > Problem Relevance.
Differentiation lens on every item: *"a competitor ships this same product — does this make ours
clearly better / harder to copy?"*

Working location: `C:\Users\owen\Downloads\paidup-nomba` (the clean submission repo, branch `main`).
Verify each iteration: `npm run build` + `npm test` (in paidup/) + `node ../smoke-test/smoke-test.mjs`.

---

## Threat model (first-run audit, 2026-06-27)

Single-tenant model: one operator behind a shared `APP_PASSWORD`. Any authed user IS the operator,
so classic cross-user IDOR on invoice ids is **not in scope** (no per-user ownership boundary). The
real attack surface is: the **public webhook**, the **export artifact** (opened in spreadsheets), the
**login** endpoint, **money-movement** routes, and **HTTP response hardening**.

## Ranked backlog

| # | Title | Criterion | Impact | Risk | Status |
|---|-------|-----------|--------|------|--------|
| S1 | **CSV/formula injection in exports** — `cell()` lacks a formula guard; `narration`/`sender` come from the webhook (external) → spreadsheet executes `=`/`+`/`-`/`@` on open | Security | M | low | **done (it1)** |
| S2 | Security HTTP headers — CSP, HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options/frame-ancestors | Security | M | low | **done (it2)** |
| S3 | Brute-force defense on `/api/login` — rate-limit + constant-time compare (login uses raw `!==`) | Security | M | med | **done (it3)** |
| S4 | Strict input validation + body-size cap on all POST routes (type coercion, mass-assignment, oversized/malformed bodies) | Security | M | med | **done (it4)** |
| S5 | Webhook hardening regression tests — replay (dup tx), stale timestamp, tampered field, signature confusion | Security/Reliability | S | low | **done (it5)** |
| S6 | Content-Disposition/filename sanitization on export (header-injection defense-in-depth) | Security | S | low | **done (it6)** |
| U1 | Reconciliation-story motion — status-chip transitions, success micro-celebration on `paid`, KPI count-ups, donut animate-to-value (Ledger identity, transform/opacity only, reduced-motion) | UX | L | med | **done (it7)** |
| U2 | `hallmark` audit of /app, /app/invoices, landing → fix hierarchy/spacing + empty/loading/error/success states | UX | M | low | **done (it8)** |
| U3 | a11y pass — aria-live on async feed/KPIs, focus trap+restore on drawer/modal, keyboard nav, WCAG AA contrast | UX | M | low | **done (it9)** |
| U4 | Playwright e2e of the core flow (create → simulate → reconcile → drawer → refund → quarantine resolve) + a11y asserts, wired into verify | Technical | M | med | **done (it14)** |
| U5 | Fix: floating Simulate panel overlaps the toolbar "+ New invoice" at desktop width (found by e2e) | UX | S | low | **done (it15)** |
| A1 | Type-safety pass — eliminate stray `any` at route boundaries, shared request validators, consistent error shape | Technical | M | low | **done (it13)** |
| A2 | Error/secret-leak hygiene — no internal messages/secrets in API responses or logs | Security | S | low | **done (it12)** |
| M1 | **Shareable customer payment page per invoice** (public link + QR for the virtual account) — top non-AI differentiator | Nomba Depth | L | med | **done (it10)** |
| M2 | Signed/branded PDF receipt + customer statement | UX | M | med | **done (it16)** |
| M3 | Immutable audit trail / append-only hash-chained event log — trust + harder-to-copy | Security/Reliability | M | med | **done (it11)** |
| M4 | Bulk invoice import (CSV) | UX | S | low | open |

### MOAT scan (non-AI features a typical entry won't have)
- **M1 customer payment page + QR** — turns the VA into a shareable "pay me" link; huge demo/UX edge. KEEP.
- **M3 hash-chained audit log** — tamper-evident ledger; speaks directly to Security/Reliability. KEEP.
- **M2 branded PDF receipt/statement** — concrete "customer-level reporting" artifact. KEEP.
- **M4 bulk CSV import** — operator quality-of-life for many invoices. KEEP (small).
- *Pruned:* scheduled WhatsApp/email reminders — needs external delivery infra + secrets, out of the
  7-day demo's safe scope; reminders without a reliable channel read as vaporware.

---

## Iteration log

### it1 — S1: CSV/formula-injection guard in exports (Security)
**Attack closed:** an attacker who controls a payment narration/sender (anyone who can transfer into a
VA) or an invoice's customer/description can plant a cell like `=HYPERLINK("http://evil","click")`,
`@SUM(...)`, or `=cmd|'/c calc'!A1`. The old `cell()` only RFC-4180-quoted (comma/quote/newline), so
a leading `= + - @ \t \r` was written raw and **executed when the operator opens the audit CSV** in
Excel/Google Sheets (data exfil / command exec via DDE).
**Root-cause fix:** `lib/export.ts cell()` now neutralizes any value beginning with a formula-trigger
character by prefixing a single quote (`'`) — the OWASP-recommended mitigation — *before* RFC-4180
quoting. Money/number cells (always non-negative, digit-leading) are unaffected, so the figures still
tie out to the on-screen ledger.
**Regression test:** `lib/export.test.ts` — malicious customer/description/narration are prefixed with
`'`; asserts no field begins with a raw formula char and that legitimate money values are untouched.

### it2 — S2: security HTTP headers on every route (Security)
**Attack closed:** clickjacking (no frame protection), MIME-sniffing (no nosniff), referrer leakage,
and an open content/script/style/connect surface — plus no HSTS to pin HTTPS on the hosted MVP.
**Fix:** new pure builder `lib/security-headers.mjs` (`buildCsp` + `securityHeaders`) wired into
`next.config.mjs` `headers()` for `/:path*` (app + API). Ships **CSP** (default-src 'self';
frame-ancestors 'none'; object-src 'none'; base-uri/form-action 'self'; script/style 'unsafe-inline'
for Next's inline bootstrap; Google-Fonts origins allowed; `'unsafe-eval'`+ws **dev-only** for HMR),
**HSTS**, **X-Content-Type-Options: nosniff**, **X-Frame-Options: DENY**, **Referrer-Policy**,
**Permissions-Policy** (camera/mic/geo/payment denied). `.mjs` so next.config and the test share it.
**Verified:** unit test (4 cases — header set, locked CSP directives, prod-has-no-eval, fonts allowed)
+ **runtime curl against `npm start`** confirmed all six headers present and `unsafe-eval` absent in
production. Tests 74/74, build + smoke green.

### it3 — S3: brute-force defense + constant-time compare on /api/login (Security)
**Attack closed:** the login endpoint had (a) **no rate limit** — an attacker could brute-force the
shared `APP_PASSWORD` at full speed, and (b) a raw `password !== pw` compare — a **timing/length
oracle**.
**Root-cause fix:** new in-memory fixed-window limiter `lib/ratelimit.ts` (per-IP, injectable clock);
`app/api/login/route.ts` now (1) rate-limits **before any password work** — 8 attempts / 15 min per
client IP, `429 + Retry-After` when exceeded, bucket cleared on a successful login so a legit operator
is never locked out; (2) compares **equal-length SHA-256 tokens via `safeEqual`** (constant-time, no
length leak).
**Verified:** 4 unit tests (limit→block, window reset, reset-on-success, key isolation) + **live
brute-force curl against `npm start` with APP_PASSWORD set: attempts 1-8 → 401, 9-10 → 429 with
`Retry-After: 899`.** Tests 78/78, build + smoke green.

### it4 — S4: boundary input validation + body-size caps (Security)
**Attack closed:** unbounded request bodies (memory/DoS), type-confusion (`amount:"100"`, `amount:{}`),
and malformed/array payloads reaching business logic on the mutation routes.
**Root-cause fix:** new pure validator `lib/validate.ts` — `parseJsonBody` (16 KB cap → 413; non-object
→ 400) + `reqString`/`optString`/`posAmount`/`oneOf` field narrowers. Applied to **/api/invoices,
/api/refund, /api/quarantine, /api/simulate, /api/webhook**: each now caps + parses the body and
narrows every field (customer/description length-capped, amount finite-positive-rounded with a sanity
ceiling, action allow-listed, ids length-capped) before touching the store.
**Verified:** 8 unit tests + **live curl pen-test on /api/invoices: oversized→413, malformed→400,
array→400, amount-as-string→400, amount-as-object→400, negative→400, valid→201.** Tests 86/86,
build + smoke green.

### it5 — S5: webhook replay/tamper/confusion regression tests (Security/Reliability)
**Coverage closed:** the webhook's two replay-defense layers and signature integrity were under-tested.
Added (1) `lib/store.test.ts` — **replay/dedupe** (duplicate transactionId → no double credit, no dup
payment row), **idempotent reversal** (replayed `payment_reversal` is a no-op, balance can't go
negative), unmatched-alias → quarantine; (2) extended `lib/verify.test.ts` — **signature is bound to
the timestamp** (captured sig replayed under a fresh `nomba-timestamp` fails), **every signed field is
tamper-evident** (event_type/requestId/userId/walletId/type/time), **signature confusion** (a sig
valid for another message doesn't validate this one), wrong-secret rejected, length-mismatch rejected
without throwing.
**Enabler:** added `PAIDUP_DISABLE_PERSIST=1` guard in `store.ts persist()` so the dedupe tests never
clobber the dev ledger; gave `store.ts`'s value import an explicit `.ts` extension (node --test
resolution) and enabled `allowImportingTsExtensions` in tsconfig (type-check-only, runtime unchanged).
**Verified:** tests 94/94 (+8), build + smoke green; confirmed `.data` ledger untouched by the run.

### it6 — S6: export filename sanitization (Security, defense-in-depth)
**Attack closed:** the CSV statement download set `Content-Disposition: filename="paidup-statement-${id}.csv"`.
Invoice ids are server-generated (so not currently exploitable), but reflecting any value into a
response header risks CR/LF/quote **header injection** — so we never reflect it raw.
**Fix:** new `safeFilenamePart()` in `lib/export.ts` reduces the id to `[A-Za-z0-9._-]`, caps 64 chars,
falls back to `export`; the export route now derives the filename from `safeFilenamePart(inv.id)`.
**Regression test:** legit id untouched, quotes/CR/LF neutralized, length-capped, empty→fallback.
Tests 95/95, build + smoke green. **— security sweep S1–S6 complete.**

### it7 — U1: reconciliation-story motion (Product UX & Clarity)
**Lifted:** the demo "wow" — motion now narrates *money lands → matched → settled* on the /app dashboard,
within the Ledger identity (CSS-first, no GSAP/scroll here per the guardrail). Consulted `gpt-taste`
motion principles (purposeful easing, surfaces react, restraint).
**Shipped:** (1) the **collection-rate donut animates to its value** — fill angle driven by a registered
`@property --rate` with a 1.1s ease, so it sweeps up on mount/change; (2) **count-up** on the rate
number (`CountUp` component, easeOutCubic, animates only on real change, jumps to target under
reduced-motion); (3) **success micro-celebration** — when the newest feed event settles an invoice
(paid/overpaid) its icon pops with an expanding emerald ring (`.event.win .ic` / `winpop`); (4) **status
chips** ease between awaiting→partial→paid colors; (5) restrained **rail-card hover** lift.
**Non-negotiables honored:** transform/opacity only (no layout thrash), the existing
`prefers-reduced-motion` block neutralizes the new transitions/animations, data is never delayed.
**Verified:** build + 95/95 tests + smoke green; `npm start` → `/app` 200 with donut/`--rate` rendering.

### it8 — U2: hallmark state/clarity audit + fixes (Product UX & Clarity)
**Audited** /app + /app/invoices against the hallmark anti-pattern list. Findings fixed (the `loading`
flag was unused; empty/loading states were bare text): (1) **loading skeletons** — the invoices table
and the live feed now render on-brand shimmer-sweep skeleton rows on first load instead of "Loading…"
/ a blank table; (2) **proper empty states** — the table distinguishes *no invoices yet* (with a "create
your first invoice" prompt) from *no matches* (echoes the search term, suggests clearing filter), and the
feed shows a "waiting for the first payment" empty state pointing to the Simulate panel; (3) error
banners are now `role="alert"` so screen readers announce a lost connection. Skeleton uses a moving
gradient sweep (reduced-motion-neutralized by the global block); all within the Ledger identity.
**Verified:** build + 95/95 tests + smoke green; `/app` and `/app/invoices` both 200 at runtime.

### it9 — U3: accessibility pass (Product UX & Clarity)
**Fixed:** (1) **WCAG AA contrast** — computed ratios found `--faint #7A715F` was only **4.17:1 on the
`--paper-2` surface** (table headers, KPI labels) → **fails AA**; retuned to `#6A6253` (≥5.2:1 on paper,
card AND paper-2) while staying visually faint. (2) **Screen-reader semantics on async updates** — added
an `sr-only` `role="status" aria-live="polite"` region that announces each new reconciliation once
(string changes only on a genuinely new top event, not the 2s poll). (3) **Keyboard nav** — the clickable
invoice rows are now `tabIndex=0 role="button"` with an `aria-label` and Enter/Space handlers + a focus
ring, so the statement drawer is reachable without a mouse. (4) the **donut** is `role="img"` with an
`aria-label` (rate + collected) and its inner text `aria-hidden`. (5) the icon-only **simulate toggle**
got an `aria-label` + `aria-expanded`. (Dialog focus-trap/restore was already in place.)
**Verified:** build + 95/95 + smoke green; runtime confirms donut aria-label + live region in the HTML.

### it10 — M1: shareable customer payment page + QR (Moat · Nomba Depth)
**Differentiator shipped:** a public, branded **/pay/<token>** page a business sends to its customer —
shows the amount/balance due, the invoice's dedicated **Nomba virtual account** (big + one-tap copy), a
server-generated **QR** of the transfer instruction, and live status (paid/overpaid settled state). This
is the tangible "send this to get paid" artifact a typical entry won't have.
**Security-conscious by design:** reached by an **unguessable random `payToken`** (not the invoice id),
so the public surface is **not enumerable**; the page exposes only payer-relevant fields (no other
ledger data); lives outside `/app`+`/api` so it works even when the dashboard is password-gated; QR is
generated **server-side (no external request, CSP-safe, offline-proof)**; page is `noindex`.
**Wired:** `payToken` added to the Invoice type + seed (stable demo tokens) + `createInvoice` (random)
+ `getInvoiceByToken`; new `lib/qr.ts`; `/pay/[token]` server page + `CopyButton` client island; a
"Customer payment page — Open / Copy link" row in the invoice drawer.
**Verified:** build + 95/95 + smoke green; runtime — `/pay/tok_inv1044` 200 with QR SVG + account +
customer, **0 other-customer mentions (no leakage)**, invalid token shows a friendly card.

### MOAT scan refresh (post-it10)
- ✅ **M1 customer payment page + QR** — SHIPPED (it10). Strongest non-AI differentiator.
- **M3 hash-chained audit log** — still open; tamper-evident ledger speaks to Security/Reliability. KEEP (next moat pick).
- **M2 branded PDF receipt/statement** — open; concrete customer-reporting artifact. KEEP.
- **M4 bulk CSV import** — open, small operator QoL. KEEP (low priority).
- *Pruned (unchanged):* scheduled WhatsApp/email reminders — needs external delivery infra/secrets, out of demo scope.

### it11 — M3: tamper-evident hash-chained audit trail (Security/Reliability moat)
**Shipped:** every money-affecting action (invoice.created, payment.*, reversal, refund,
quarantine.assigned/bounced) now appends an entry to an **append-only, SHA-256 hash-chained** log —
each entry's hash covers the previous hash, so editing, reordering, or deleting any past entry breaks
the chain. New `lib/audit.ts` (`appendEntry`/`verifyChain`/`hashEntry`, pure+sync); the store records
on each mutation, persists the chain, and seeds a verifiable chain from the seed events. New operator
endpoint **GET /api/audit** returns the chain + an integrity verdict (`verified`, `brokenAt`), with
`?format=csv` for an external auditor; "⛓ Audit trail" link added to the invoices toolbar.
**Why it's a moat:** "our ledger is provably intact" is a Security/Reliability claim a typical entry
can't make — and it's grounded, not cosmetic.
**Verified:** 6 unit tests (intact chain verifies; edit/forge-with-rehash/delete/reorder all detected;
empty chain valid) + **runtime: seeded chain verified:true (count 4); after a real reconcile the chain
grew 4→5 and stayed verified**; CSV export works. Tests 101/101, build + smoke green.

### it12 — A2: error/secret-leak hygiene (Security)
**Leak closed:** three API paths echoed raw exception text to the client — `/api/webhook` (both 500
catches returned `(e as Error).message`) and `/api/sync` (per-invoice errors array). Internal error
strings can disclose stack/lib internals to an attacker. **Fix:** each catch now `console.error`s the
detail **server-side only** and returns a generic message (`"internal error"` / `"could not fetch
transactions"`). **Verified:** a project-wide grep for leak patterns (`as Error).message`, `String(e)`,
`${e}`, `.message`, `stack` in `app/api`) returns **zero** matches; build + 101/101 tests + smoke green.

### it13 — A1: type-safety / architecture pass (Technical Execution)
**Tightened:** removed stray `any` from non-AI code — `nomba.ts` pure parsing helpers (`pick`,
`mapCredit`, `rows`) now take `Record<string, unknown>`/`unknown[]` instead of `any`; the three UI
callbacks (`onAssign`/`onBounce`/`refund`) are `Promise<unknown>` not `Promise<any>`. The route bodies
were already narrowed via the it4 `validate.ts` (`unknown` → typed). **Deliberately left as documented
boundary `any`:** the raw Nomba response in `nomba.ts` network functions and the MiniMax response in
`ai.ts` — typing untyped third-party JSON as `any` at the single integration seam is idiomatic and
changing it would force churny casts across the live integration for no safety gain (AI code is also
off-limits per the loop guardrail). **Verified:** build + 101/101 tests + smoke green; no behavior change.

### it14 — U4: Playwright e2e of the core flow + a11y (Technical Execution / UX, tested)
**Shipped:** real-browser e2e (`@playwright/test`, chromium) — `e2e/core-flow.spec.ts`:
(1) **simulate a payment → invoice reconciles to paid → drawer + share link** (drives the Simulate
panel, asserts the live feed updates, the invoice flips to *paid*, the statement drawer shows the
virtual account, and the M1 "Customer payment page" link is present); (2) **a11y** — donut exposes
`role="img"` aria-label, invoice rows are focusable `role="button"`, the new-invoice dialog is
`aria-modal` and Esc-dismissable. Runs against the **precompiled prod server with DEMO_MODE=1**
(deterministic, fast; `globalSetup` reseeds the ledger; relies on Playwright auto-waiting, no sleeps).
`npm run test:e2e` (= `next build && playwright test`) is self-contained; kept out of the fast unit gate
and out of `next build` typecheck (tsconfig exclude). **Found a real UX bug** (logged U5): the floating
Simulate panel overlaps the toolbar "+ New invoice" at desktop width.
**Verified:** **2/2 e2e pass**; unit 101/101, build + smoke still green.

### it15 — U5: fix Simulate-panel/toolbar overlap (Product UX & Clarity)
**Bug (found by it14 e2e):** the fixed 288px Simulate panel (`right:24px`) overlapped the toolbar
"+ New invoice" + the live-page rail actions at 1080–~1550px viewports, intercepting clicks.
**Root-cause fix:** the app pages now reserve a right gutter — `app-shell` wrapper in the app layout +
`@media(min-width:1081px){.app-shell main{padding-right:336px}}` (only where the panel is shown; it's
hidden ≤1080px). Scoped to `/app/*` so the marketing/onboarding layouts are untouched.
**Verified by the e2e itself:** removed the temporary "collapse panel" workaround from the a11y spec —
the "+ New invoice" click now succeeds with the panel open, proving the overlap is gone. 2/2 e2e pass;
unit 101/101, build + smoke green.

### it16 — M2: branded printable receipt + verification code (Moat · UX)
**Shipped:** a public **/pay/<token>/receipt** — a clean, branded receipt listing every payment
received against the invoice (date / sender / method / amount), invoice + received totals, the dedicated
virtual account, and a **tamper-evident verification code** (`lib/receipt.ts receiptHash` = SHA-256 over
the receipt's figures; altering any amount changes the code). "Print / Save as PDF" produces a
professional document — `@media print` hides the app chrome. Linked from the settled payment page.
Public via the unguessable pay token, exposes only payer-relevant fields (verified **0 other-customer
mentions**), `noindex`. **No new dependency** (browser print → PDF).
**Verified:** 4 unit tests (number format, hash stability, tamper-sensitivity, hex shape) + runtime —
receipt 200 with receipt-no/verification-hash/customer; bad token → friendly card (200, no leak).
Tests 105/105, build + smoke green.

### MOAT scan refresh (post-it16)
- ✅ **M1 payment page + QR** (it10), ✅ **M3 hash-chained audit trail** (it11), ✅ **M2 branded
  receipt + verification code** (it16) — three trust/reporting differentiators a typical entry won't have.
- **M4 bulk invoice import (CSV)** — still open, small operator QoL. KEEP (low priority).
- *New idea considered & pruned:* per-invoice realtime push (SSE) instead of the 2s poll — nice but the
  poll is already snappy and SSE adds reconnection/scale complexity for marginal demo gain. PRUNE.
- *Pruned (unchanged):* scheduled WhatsApp/email reminders — external delivery infra/secrets, out of scope.
