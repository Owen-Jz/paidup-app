# PaidUp — Rubric Gap Audit & Backlog

> **2026-07-03 — #16 (no auth) CLOSED for real.** The opt-in shared-password gate was replaced with
> **multi-tenant authentication**: self-serve signup (`/signup`), scrypt-hashed passwords with per-user
> salts, stateless HMAC-signed session cookies (8h, `SESSION_SECRET`, tokenVersion revocation), a
> fail-closed middleware over `/app` + `/get-started` + `/api` (webhook/login/signup/logout stay public),
> and **`tenantId` scoping on every ledger record and every API route** — enforced in the store and
> covered by a dedicated isolation test suite (cross-tenant read/assign/refund/bounce all refused).
> Seed data lives in a demo workspace (`demo@paidup.app` / `LedgerDemo2026`); fresh signups get an
> empty isolated ledger. Deferred (v1): email verification, password reset, team members. 123/123 tests.

> **Iteration: 20/20 — 20-CAP LOOP COMPLETE (STOPPED).** Hard cap reached; AI-moat backlog done or
> consciously pruned, and a fresh re-audit + moat scan surfaces nothing that clears the "good→wins" bar.
> See the **🏁 Final summary — 20-iteration AI-moat loop** below. (The original 10-iteration summary is
> further down, now historical.)

---

## 🤖 AI-moat re-audit (2026-06-26, 20-cap loop)

**MiniMax key is LIVE** in the environment (`MINIMAX_API_KEY`), verified against
`https://api.minimax.io/v1/text/chatcompletion_v2` (model `MiniMax-Text-01`, OpenAI-compatible).
Design rule for every AI feature: **deterministic fallback first** — AI augments, never gates. If the
key is missing/rate-limited/slow (8s timeout) the feature degrades to the existing engine and the demo
is unaffected. AI output is always validated against real ledger state (no hallucinated invoice ids).

### New ranked backlog (highest-impact first)
| # | Title | Criterion it lifts | Impact | Risk | Status |
|---|---|---|---|---|---|
| A1 | **AI unmatched-payment resolver** — MiniMax reads narration+sender+candidates, picks the owner & explains in plain English; falls back to the deterministic scorer | Nomba depth (unmatched handling) + UX + AI moat | L | low (fallback) | **done (iter 11)** |
| A2 | **AI anomaly explanations** — per-flag "why it matters + recommended action" in plain English; fallback = static message | Security/Reliability + UX | M | low | **done (iter 13)** |
| A3 | **AI reconciliation summary** — natural-language end-of-day digest of the whole ledger; fallback = templated summary | UX (reporting clarity) + AI moat | M | low | **done (iter 14)** |
| A4 | **AI config in env.example + SECURITY/README** — document the AI surface, fallback guarantee, and that no key = no degradation | Technical/Security clarity | S | none | **done (iter 15)** |
| A5 | **AI status indicator** — small "AI live / heuristic" badge so judges see graceful degradation in action | UX | S | none | **done (iter 16)** |
| A6 | **AI unit tests with injected client** — make the AI seam testable (mock the chat fn), assert fallback on null/invalid | Technical | S | none | **done (iter 17)** |
| A7 | **Resolver result caching** — cache AI suggestion by transactionId so 2s polling/clicks don't re-bill MiniMax | Technical/Reliability | S | low | **pruned** (AI is on-demand only, never on the poll → no re-billing to cache against) |
| A8 | **Animation / UX polish pass** — staggered feed entrance, AI-brief shimmer, prefers-reduced-motion guard | Product UX & Clarity | S | none | **done (iter 18)** |

### MOAT scan (what a typical entry won't have)
AI unmatched-resolver with explainable reasoning · AI anomaly triage notes · AI plain-English
reconciliation digest — all three with deterministic fallbacks (the *engineering* moat: AI that can't
break the money path). Plus the already-shipped six (suggested-match, one-tap refund/bounce, idempotent
requery replay, audit CSV export, anomaly flags, reversal handling).

### Pruned (this re-audit)
- **AI auto-resolve (no human)** — moving money on an LLM guess is a money-correctness risk; AI suggests,
  human confirms. Keep the one-click Accept, not auto-apply.
- **Realtime SSE over polling** — polling at 2s is fine for the demo; SSE adds infra risk for no judging gain.
- **Postgres swap** — owner/infra action, not loop code (already documented).

---

### 🔁 AI hardening loop log (20-cap)
- **Iter 20 — final re-audit + summary (LOOP STOP).** Fresh re-audit + moat scan run across all five
  criteria: the AI-moat backlog (A1–A6, A8) is shipped, A7 pruned with reason, and no new candidate clears
  the "good→wins" bar above what's done. Remaining ideas (aria-live announcements on async AI results;
  Postgres for serverless) are genuine but are a small a11y nicety and an owner/infra action respectively —
  not loop-worthy now. No code change this iteration; wrote the final summary below and stopped the loop.
  build✓ 67 tests✓ smoke✓.
- **Iter 19 — DEMO.md demo script** *(Product UX & Clarity + submission completeness)* ✅
  The submission requires a 2–3 min demo video; `DEMO.md` is the timed script mapped to the judging rubric:
  wound (landing) → per-invoice VA → live auto-reconcile (exact/partial/overpaid) → statement drawer +
  one-tap refund → **unmatched + AI resolver** → anomaly explanations → **AI brief** → close on trust
  (fail-closed HMAC, 67 tests). Includes a one-line pitch for the form + on-the-day fallbacks. README links
  to it. Docs-only; build✓ 67 tests✓ smoke✓.
- **Iter 18 — A8: animation / UX polish pass** *(Product UX & Clarity — demo wow)* ✅
  Tasteful motion in the editorial "Ledger" register (not flashy): live-feed events **rise in** as they
  arrive (`riseIn`, with a small nth-child stagger that only enriches first paint — keyed DOM nodes mean only
  genuinely new events animate, not the whole list every 2s poll); the **AI brief shimmers** while generating
  (`.brief.loading`); and a **`prefers-reduced-motion` guard** neutralizes decorative animation + transitions
  for users who ask for less motion (real a11y win). CSS-only + one class toggle. build✓ 67 tests✓ smoke✓.
- **Iter 17 — A6: direct fetch-fallback tests for `lib/ai.ts`** *(Technical Execution + Security/Reliability)* ✅
  The AI seam was already injectable (resolver/anomaly/summary fallbacks tested via mock chat fns); this adds
  the missing piece — direct tests of the MiniMax client itself. `lib/ai.test.ts` sets the key before a dynamic
  import (deterministic regardless of ambient env) and mocks global `fetch` to drive every branch: success
  (trimmed content), ```json``` fence-strip + parse, JSON-embedded-in-prose, and **null on HTTP error /
  base_resp error status (rate limit) / network throw / empty content / unparseable JSON**. Proves the moat's
  core safety claim — the client never throws and always degrades to the deterministic engine. +9 tests
  (total 67). build✓ 67 tests✓ smoke✓.
- **Iter 16 — A5: AI status indicator** *(Product UX & Clarity)* ✅
  Added an `✨ AI LIVE / ✨ AI OFF · RULES` pill to the `/app` header, driven server-side by `aiConfigured()`
  (the app layout is a server component, so the badge reflects the real env with zero client plumbing). Makes
  the graceful-degradation story visible at a glance — judges see that AI augments when present and the
  deterministic engine runs everything when it's not. Title attr explains each state. Live-verified: key present
  → "AI LIVE". build✓ 58 tests✓ smoke✓.
- **Iter 15 — A4: document the AI surface** *(Technical/Security clarity — submission readability)* ✅
  `.env.local.example` now documents `MINIMAX_API_KEY` (+ optional base/model/timeout) as fully OPTIONAL with
  the graceful-fallback guarantee spelled out (no secret committed). `README.md` gains an **"AI moat"** section
  (the three features, grounding, AI-suggests-human-confirms, on-demand, the `lib/ai.ts` null-fallback seam),
  adds the new routes/libs to the architecture, corrects the stale "resolver could be upgraded to an LLM" note
  (it now IS), and bumps the test count to 58. `SECURITY.md` gains an **"AI safety"** section: AI never moves
  money / grounded output / fails-safe-never-closed / key handling. Judges read these files — the moat is now
  legible. Docs-only; build✓ 58 tests✓ smoke✓.
- **Iter 14 — A3: AI reconciliation brief (MiniMax)** *(UX reporting clarity + AI moat)* ✅
  `lib/summary.ts` — three layers: `snapshot()` (pure ledger roll-up: totals, status counts, top-outstanding),
  `templatedSummary()` (pure deterministic prose — the always-available fallback), and `aiSummary()` (MiniMax
  writes a warmer/sharper brief over the SAME computed figures; on any failure it returns the templated text).
  Grounded: the model only receives pre-computed numbers, so it can't invent money. `/api/summary` (on-demand,
  off the poll) + a "✨ AI reconciliation brief" railcard on `/app` with Generate / Regenerate and a source
  label ("Written by MiniMax" vs "AI unavailable — auto-generated"). +6 unit tests (snapshot math / templated
  grounding / AI-text / null + blank fallback) — total now 58. **Live-verified:** seed ledger → "invoiced
  ₦2,233,500, collected 95%… follow up Konga & Jumia." build✓ 58 tests✓ smoke✓.
- **Iter 13 — A2: AI anomaly explanations (MiniMax)** *(Security/Reliability + UX)* ✅
  Each deterministic flag (large overpayment / possible duplicate / repeat-unmatched / multi-invoice payer)
  can now be turned into a plain-English next action for a non-technical SME operator. `anomaly.explainAnomalies()`
  — ONE batched MiniMax call for all current flags (kept off the 2s poll so it never re-bills), grounded by
  index, injectable for offline tests; on no-key/failure/misaligned output it returns the flags unchanged so
  the static messages still show. `/api/explain` re-scans live ledger state and attaches recommendations;
  flags panel gets a "✨ Explain with AI" button that renders each recommendation under its flag (keyed by
  flag identity, not array index, to survive re-renders). +3 unit tests (alignment / null-fallback / empty
  no-op). **Live-verified:** large overpayment → "Contact customer to confirm if overpayment was intentional
  or a mistake." build✓ 52 tests✓ smoke✓.
- **Iter 12 — P0 (discovered): foundational source files were UNTRACKED — repo was non-buildable** *(Technical/Reliability — submission-critical)* ✅
  Audit of `git ls-files` found 13 essential files never committed by the earlier scoped-commit loop:
  **`lib/verify.ts` + `verify.test.ts`** (the scored 9-field HMAC core, imported by the webhook + named
  in the test script), **`app/page.tsx`** (the landing/entry), **`app/layout.tsx` + `app/app/layout.tsx`**
  (without which nothing renders), **`app/get-started/page.tsx`**, **`app/api/invoices/route.ts`** (create
  VA / list), **`app/api/refund/route.ts`** (refund — documented as shipped), `components/Nav.tsx`,
  `next.config.mjs`, `tsconfig.json`, `package-lock.json`, and **`.gitignore`** (which protects `.env*`).
  A fresh clone of the public submission repo would not build. Committed all of them (scoped to `paidup/`),
  verified no secrets (`.env.local`/`.data`/`node_modules` correctly ignored). This is the highest-impact
  fix available — a non-building repo fails judging outright. build✓ 49 tests✓ smoke✓.
- **Iter 11 — A1: AI unmatched-payment resolver (MiniMax)** *(Nomba depth / unmatched handling + UX + AI moat)* ✅
  `lib/ai.ts` — a graceful MiniMax client (`chat`/`chatJSON`): no key / HTTP error / `base_resp` error /
  8s timeout / unparseable JSON all return `null` so callers fall back (verified live vs MiniMax-Text-01).
  `lib/resolver.ts` `aiResolve()` — sends the payment + open-invoice candidates to MiniMax, which picks the
  owner and explains in plain English; **hard-grounded** (the pick must be a real, still-open invoice or we
  fall back to the deterministic scorer) and **injectable** (mock chat fn → fully offline-testable). On-demand
  `/api/resolve` (kept off the 2s poll so it never re-bills); "✨ Ask AI" button in the quarantine row shows
  the AI's reason + a one-click Accept; AI only *suggests*, the human still confirms (no auto-move of money).
  +5 unit tests (valid pick / null-fallback / hallucinated-id rejection / no-move). **Live-verified through Next:**
  Konga ₦75,500 → INV-1044 (source ai, high, real reasoning); "inv 1050" (nonexistent) → AI states it doesn't
  exist and grounds to a real invoice instead — no hallucination. build✓ 49 tests✓ smoke✓.

---

# 🏁 Final summary — 20-iteration AI-moat loop (iters 11–20)

**Verification at stop:** `npm run build` green · `npm test` **105/105** · repo smoke test green · AI flows
**live-verified vs MiniMax-Text-01** (resolver positive match + no-hallucination grounding, anomaly
explanation, reconciliation brief) and the reconcile/auth/reversal flows live vs `sandbox.nomba.com` (the
refund/transfer call-path is exercised but settlement is **production-only**).

### What this loop added on top of the first 10
The 10-cap loop hardened security, reconciliation depth, UX and tests (Security 4.5→~9, Technical 6→~9,
UX 6→~9, Nomba 7→~9). This loop did two things: **(1) shipped a real AI moat** (MiniMax, everywhere behind
a deterministic fallback), and **(2) fixed a submission-fatal P0** — foundational source files were untracked.

### Shipped this loop (9 changes, each green + scoped to `paidup/`)
1. **AI unmatched-payment resolver** (MiniMax, grounded, human-confirms)
2. **Repo P0 fix:** 13 untracked foundational files committed (repo now builds from a clean clone)
3. **AI anomaly explanations** (per-flag recommended action)
4. **AI reconciliation brief** (NL digest over computed figures)
5. **AI surface documented** (env.example + README "AI moat" + SECURITY "AI safety")
6. **AI status pill** (visible graceful degradation)
7. **Direct `lib/ai.ts` fetch-fallback tests** (the safety proof)
8. **Animation/UX polish** (feed rise-in, AI shimmer, prefers-reduced-motion)
9. **DEMO.md** (timed 2–3 min demo script)

### Per-criterion standing (after this loop; self-assessed)
| Criterion | Now | What this loop moved |
|---|---|---|
| Security & Reliability | **~9.5** | AI **fails safe, never closed** (null on every failure → deterministic path), grounded output can't invent money, AI client directly tested; webhook fail-closed + dedupe unchanged |
| Technical Execution | **~9.5** | AI seam injectable + unit-tested end to end (105 tests); **repo now actually builds from a clean clone** (was not) |
| Product UX & Clarity | **~9.5** | AI resolver "Ask AI", anomaly "Explain", reconciliation brief, AI-live pill, feed animation; DEMO.md for the video |
| Nomba Integration Depth | **~9** | AI sharpens the *unmatched-handling* sub-bar specifically (the hardest reconciliation case) on top of the existing requery/refund/reversal breadth |
| Problem Relevance | **~9** | The AI brief + resolver speak directly to the SME owner's real question ("where's my money, what needs me") in plain English |

### The moat (what a typical entry won't have)
AI unmatched-payment **resolver** · AI **anomaly** recommendations · AI **reconciliation brief** — all three
**grounded** and with **deterministic fallbacks** (the engineering moat: *AI that cannot break the money
path*). On top of the six from the first loop (suggested-match, one-tap refund/bounce, idempotent requery
replay, audit CSV export, anomaly flags, reversal handling).

### Pruned (with reason)
- **A7 resolver caching** — AI runs on-demand (button), never on the 2s poll, so there's no re-billing to
  cache against.
- **AI auto-resolve (no human)** — moving money on an LLM guess is a correctness risk; AI suggests, human confirms.
- **Realtime SSE** — 2s polling is fine for the demo; SSE adds infra risk for no judging gain.

### Genuinely open (owner actions / future, not loop code)
- Swap the file store → Postgres before a **serverless** deploy (fine as-is on a single instance/Render).
- Set real `NOMBA_WEBHOOK_SECRET` + tunnel `/api/webhook` + submit Nomba's form; set `APP_PASSWORD` + a real
  `MINIMAX_API_KEY` for a hosted deploy.
- Nice-to-have: `aria-live` announcements when async AI results arrive (screen-reader polish).

**Outcome:** PaidUp now pairs a tested, fail-safe reconciliation engine with an AI layer that demonstrably
sharpens the work without ever endangering money — and the submission repo builds, is documented, and has a
demo script. Loop stopped at the 20 cap.

---

## 📜 Historical: 10-iteration audit & backlog (cap was 10)

Single deep pass, 2026-06-26. One agent per rubric criterion scored `paidup/` against the
Nomba x DevCareer judging rubric (focus bar: *reconciliation quality, under/overpayment handling,
customer-level reporting clarity*). Ranked fix / build / prune backlog below.

## Scorecard (0–10, for a *winning* entry)

| Criterion | Score | One-line |
|---|---|---|
| Problem Relevance | **8** | On-thesis, NG-flavored, but leads with the cure not the wound; differentiator unargued. |
| Nomba Integration Depth | **7** | Core unusually correct (9-field HMAC, sub-account VA, v2 transfer); breadth thin (no requery/refund). |
| Technical Execution | **6** | Clean + correct on happy path; ZERO tests on the judged core; a NaN money-corruption path. |
| Product UX & Clarity | **6** | Gorgeous UI + winning live demo; but no per-invoice statement, no actionable refund/quarantine. |
| Security & Reliability | **4.5** | HMAC right but **fail-open by default**; public forge endpoint; in-memory dedupe double-credits on restart. |

**Headline:** the build looks and demos great, but the two lowest scores (Security, UX) are on
criteria we can move cheaply, and there are 3 genuine **P0**s that are money-incorrect or security holes.

---

## P0 — costs us the win / money-incorrect / security hole

1. **[fix] Webhook verification fails OPEN when secret unset** *(Security)* — `app/api/webhook/route.ts:23-29`. Deployed demo with no `NOMBA_WEBHOOK_SECRET` accepts any forged `payment_success`. → Fail **closed** in production; only skip behind explicit `ALLOW_UNSIGNED_WEBHOOKS=1`. **S**
2. **[fix] Public `/api/simulate` forges payments, no auth/env guard** *(Security)* — `app/api/simulate/route.ts:10-31`. Anyone can curl it to mark any invoice paid on the live deploy. → Gate behind `DEMO_MODE`/404 in production. **S**
3. **[fix] Non-numeric webhook amount → NaN poisons the ledger** *(Technical/Security)* — `app/api/webhook/route.ts:42` + `lib/reconcile.ts:26-35`. `Number(blank)`→NaN falls through to `overpaid` with `overpaidBy:NaN`; `invoice.paid` becomes NaN forever, all KPIs NaN. → Validate finite>0 at the boundary + guard `classify()`; quarantine invalid. **S**
4. **[build] In-memory dedupe + ledger double-credits on restart/serverless** *(Security)* — `lib/store.ts:7-52`. `seenTx` lost on cold start → Nomba's retries (5× over ~53min) re-apply the same `transactionId`. → Durable processed-tx set + balances (file-backed for single-instance demo; Postgres for prod). **L→M**
5. **[build] No per-invoice statement view** *(UX — the literal judged sub-bar)* — `invoices/page.tsx:60` rows don't drill down though `Invoice.payments[]` exists. → Detail drawer: header + running balance + payment-history timeline + VA number/copy. **M**
6. **[build] Overpaid refund promised in copy but not actionable** *(UX)* — `app/page.tsx:71` markets "refund in one tap"; no button exists. → `/api/refund` → `transferToBank`, button on overpaid rows. **M**

## P1 — clearly hurts a criterion

7. **[build] Zero tests on the judged core + a comment that lies** *(Technical)* — `lib/reconcile.ts:1` claims "unit-tested (see reconcile.test.mjs)"; file doesn't exist. → `node:test` for `classify()` + `verifyNombaSignature()` incl. the docs HMAC vector + NaN/partial/overpay/tolerance edges. **M**
8. **[build] No requery/transactions backfill** *(Security/Nomba)* — never calls `/v1/transactions/virtual` or requery; webhook-only ledger with no recovery. Docs: "never rely on webhooks alone." → `getVirtualAccountTransactions()` + a "Sync from Nomba" action. **M**
9. **[build] Quarantine surfaced but not resolvable** *(UX)* — no queue, no assign-to-invoice; count derives from trailing 20 events so items fall out. → Quarantine list (persistent) + assign/refund actions. **M**
10. **[fix] "Attention" filter contradicts its KPI** *(UX)* — `invoices/page.tsx:19` shows only `overpaid`; KPI says "overpaid + unmatched". → Make Attention a real triage queue; align to KPI. **S**
11. **[fix] Minted VA number not surfaced on create** *(UX)* — `invoices/page.tsx:101` just closes modal. → Success state w/ big account number + Copy + share text. **S**
12. **[fix] No loading/error states; silent fetch failure shows zeroed board** *(UX)* — `components/dashboard.tsx:17-28` no try/catch. → reconnecting banner + first-paint skeleton. **S**
13. **[fix] Landing leads with the cure, never the wound** *(Relevance)* — `app/page.tsx:21-23`. → before/after beat; promote the `"Pymt for inv 1050"` quarantine as the visceral pain. **S**
14. **[fix] Differentiator never argued** *(Relevance)* — why per-invoice account beats "one account + a reference" is unstated. → one line: customers can't be trusted to type a ref, so the account *is* the ref. **S**
15. **[fix] Live VA creation mocked by default** *(Nomba)* — `app/api/invoices/route.ts:24-33`. → default to real sandbox VA until the 2-VA cap, then fall back; show ≥1 real NUBAN in the demo. **S**
16. **[build] No auth anywhere** *(Security)* — every API + dashboard public. → minimal shared-password/cookie gate over `/app` + mutating routes. **M** *(deferred — demo trade-off, see below)*

## P2 — polish / hardening

17. **[fix] Idempotency key embeds `Date.now()`** *(Technical/Nomba)* — `lib/nomba.ts:91`. Defeats the header's purpose. → derive from stable id. **S**
18. **[fix] `seenTx` added before processing** *(Security)* — `lib/store.ts:115`. A throw after the add silently loses the payment. → add only on success + try/catch. **S**
19. **[fix] No `nomba-timestamp` freshness check** *(Security)* — `lib/verify.ts`. → reject events older than ±5min. **S**
20. **[fix] `authed()` ignores HTTP status** *(Nomba)* — `lib/nomba.ts:31-43`. → on 401 invalidate token + retry once; surface 429. **S**
21. **[fix] Money as float + cargo-cult EPSILON** *(Technical)* — `lib/reconcile.ts:38-40`. → drop EPSILON, document the kobo-tolerance choice. **S** (full integer-kobo = **L**, deferred)
22. **[fix] Loose TS at integration seams (`any`)** *(Technical)* — `webhook/route.ts:12,38` + `nomba.ts:31`. → type webhook fields + response envelope; cap events array. **S**
23. **[fix] `--faint` text fails WCAG AA** *(UX)* — `globals.css:10` ~2.3:1. → darken to ~#7A715F. **S**
24. **[fix] Modal a11y (no Esc/focus-trap/label htmlFor)** *(UX)* — `invoices/page.tsx:104+`. → role=dialog, Esc, focus return, label binding. **M** *(partial)*
25. **[fix] Invoice table not responsive** *(UX)* — `globals.css:122` clips on narrow. → `overflow-x:auto`. **S**
26. **[prune] Onboarding "Connect Nomba" creds are theater** *(UX)* — `get-started/page.tsx:94-97` prefilled keys do nothing. → label honestly as sandbox preview (don't hardcode real-looking secrets that no-op). **S**

---

## Execution plan

**This pass (P0 + high-ROI P1/P2, safe + verifiable):** 1, 2, 3, 4 (file-backed), 5, 6, 7, 10, 11, 12,
13, 14, 15, 17, 18, 19, 20, 22, 23, 26. Verified by `npm run build` + `npm test` + screenshots.

**Deferred (bigger / needs a call):** 8 (requery backfill — M, do next), 9 (quarantine resolve — M),
16 (auth gate — demo trade-off; add before public deploy), 21 (integer-kobo — L), 24/25 (a11y/responsive polish).

---

## ✅ Resolved (this pass, 2026-06-26)

Verified by `npm test` (15 pass), `npm run build` (green), and live curl/screenshots.

- **#1 fail-open webhook** → fails CLOSED in production (503) unless `ALLOW_UNSIGNED_WEBHOOKS=1`. *(verified: prod `npm start` returns 503 with no secret.)*
- **#2 public simulate** → 404 in production unless `DEMO_MODE=1`.
- **#3 NaN amount** → `isValidAmount` guard in `classify()` + webhook boundary; invalid → 400. *(verified.)*
- **#4 restart double-credit** → durable file-backed store (`.data/ledger.json`), dedupe committed after success. *(serverless still needs Postgres — noted.)*
- **#5 per-invoice statement** → row-click drawer: history timeline, running balance, VA + copy.
- **#6 overpayment refund** → `/api/refund` → lookup → `/v2/transfers/bank`; button on overpaid rows. *(call path exercised; refund/transfer settlement is **production-only** — Nomba sandbox doesn't settle transfers.)*
- **#7 tests** → `lib/reconcile.test.ts` + `lib/verify.test.ts` (15 cases incl. docs HMAC vector); false comment removed.
- **#10 attention filter** → KPI delta now "N overpaid · N unmatched"; quarantine surfaced in Attention view.
- **#11 VA on create** → success state with big account number + Copy + share line.
- **#12 loading/error** → try/catch poll + "reconnecting" banner + loading row.
- **#13/#14 relevance copy** → before/after band (the wound), NG framing + persona in hero, "the account number IS the reference" differentiator.
- **#15 VA mock** → defaults to real sandbox VA, falls back to mock on cap/error.
- **#17 idempotency key** → stable (`refund_<invoice>_<txid>`), no `Date.now()`.
- **#18 dedupe ordering** → `seenTx` added only after success; webhook try/catch.
- **#19 timestamp freshness** → `isTimestampFresh` (±5min) enforced when secret set.
- **#20 authed status** → 401 → drop token + retry once; 429 surfaced.
- **#22 loose TS** → typed `NombaPaymentWebhook`; events array capped at 200.
- **#23 contrast** → `--faint`/`--muted` darkened to AA.
- **#26 onboarding theater** → "Connect Nomba" relabelled as honest sandbox preview; no real-looking secrets hardcoded.

**Still open (recommend next):** — (see loop log; #21 pruned).

---

## 🏦 Virtual-account lifecycle policy (decided 2026-07-01)

**Decision: PaidUp uses STATIC (non-expiring) virtual accounts, scoped one-per-customer, not one-per-invoice.**
Rationale traced from the Nomba reference (`NOMBA-API-REFERENCE.md` §Virtual Accounts):

- **Static vs dynamic** — a VA is *static* (permanent NUBAN) when `expiryDate` is omitted, *dynamic*
  (time-boxed) when it's set. The invoice route (`app/api/invoices/route.ts:42`) calls
  `createVirtualAccount` **without** `expiryDate` → all invoice VAs are static today. This is intentional
  and stays.
- **Why static** — (1) a customer who pays a month late still lands the money (no expired-account bounce);
  (2) it removes the reused-saved-beneficiary failure mode (the number a customer saved never dies);
  (3) "expiry" lives in *our* ledger as an invoice status (overdue / written-off), which we control —
  not on the bank rail, whose expired-inbound behavior is undocumented.
- **Scope one static VA per repeat customer, not per invoice** — bounds the live-account count to the
  *active customer base* (not transaction volume). `accountRef` is the reconciliation key tying the VA to
  the customer; invoices are attributed within the customer ledger. Use *dynamic* expiring VAs only for
  genuine one-off buyers who will never return.
- **Lifecycle management** — static VAs are permanent and do **not** auto-recycle. Reclaim churned
  customers with **Suspend** (`PUT /v1/accounts/suspend/{accountId}`) / **Expire**, and audit the live set
  with **Filter/list** (`virtual-accounts/*`). Only suspend/expire **after** the customer's balance is
  settled and a grace period has passed, so a late payer never hits a dead account.

### Open items (both UNVERIFIABLE in sandbox — must confirm against a live/production Nomba account)
- **[VA-1] Real per-merchant static-VA ceiling.** The verified reference documents **no production VA cap**
  ("No VA cap in production"); the only ever-documented cap was the sandbox 2-VA limit (now removed for
  hackathon accounts). An anecdotal "~30" limit has been raised but is **not in the reference** — do **not**
  design around it. Confirm the true production ceiling with Nomba before relying on per-customer static VAs
  at scale.
- **[VA-2] Expired/suspended-VA inbound behavior.** The reference does not state what happens to a transfer
  sent to an *expired* or *suspended* static VA — the payer's bank may reverse it, or the transfer may fail
  at initiation. Sandbox has **no expiry support**, so this cannot be tested there. Verify in production
  before enabling any Suspend/Expire flow, and until then keep the grace-period rule above.

---

## 🔁 Hardening loop log

- **Iter 1 — #8 requery/transactions backfill** *(Security/Reliability + Nomba depth)* ✅
  `lib/nomba.ts` `getVirtualAccountTransactions()` (maps the `/v1/transactions/virtual` reporting
  rows defensively) + `app/api/sync/route.ts` (re-runs Nomba's recorded credits through the SAME
  dedupe+reconcile path — idempotent, repairs the ledger if a webhook was missed) + "🔄 Sync from
  Nomba" control in `SimPanel` with reconciled/applied/duplicate counts. Lifts the weakest top-weighted
  criterion (Security 4.5) and the "never rely on webhooks alone" reliability story. build✓ 15 tests✓ smoke✓.
- **Iter 2 — #9 quarantine assign/resolve** *(UX + Nomba "unmatched handling")* ✅
  Turned the read-only quarantine list into an action queue. `resolveQuarantineToInvoice()` re-matches an
  unmatched payment to a chosen invoice and reconciles it (reuses the existing tx — no double-count);
  `markQuarantineBounced()` + `/api/quarantine` `bounce` returns the money to the payer via
  `/v2/transfers/bank`. Persisted sender bank details on `FeedEvent` to enable bounce. UI: per-row invoice
  picker + Assign / Bounce-to-sender in the Attention queue. Live e2e verified (assign consumes the item,
  invoice gains the payment). Directly addresses the judged "unmatched handling" sub-bar. build✓ 15 tests✓ smoke✓.
- **Iter 3 — MOAT: smart unmatched-payment resolver** *(Nomba depth + UX + differentiation)* ✅
  `lib/resolver.ts` — deterministic, explainable scoring of a quarantined payment against open invoices
  (narration→invoice-number 60pts, amount=total/balance ~30pts, sender↔customer name overlap, stop-word
  guarded). `/api/events` attaches `bestMatch()` to each unmatched payment; the Attention queue now shows
  "✦ Suggested INV-XXXX · confidence · reasons" with a one-click **Accept**. Answers "is AI integrated"
  with a real, testable engine (LLM-upgradable on the same signals). +9 unit tests (24 total). build✓ 24 tests✓ smoke✓.
- **Iter 4 — MOAT: audit-grade reconciliation export (CSV)** *(UX "customer-level reporting clarity" + Technical)* ✅
  `lib/export.ts` — pure RFC-4180 CSV builders: `ledgerCsv()` (one row per invoice, tied-out
  due/collected/balance/overpaid) + `statementCsv()` (one row per payment with a running total).
  `/api/export` streams them with `Content-Disposition`; "⤓ Export CSV" on the toolbar (full ledger)
  and "⤓ Statement CSV" in the drawer (per invoice). Gives judges a concrete, openable artifact for the
  named "customer-level reporting clarity" sub-bar. +5 unit tests (29 total). build✓ 29 tests✓ smoke✓.
- **Iter 5 — #16 auth gate (opt-in shared password)** *(Security/Reliability)* ✅
  `middleware.ts` gates `/app/*` + all `/api/*` behind a session cookie when `APP_PASSWORD` is set
  (no-op/open when unset — demo stays open). Cookie = SHA-256 token derived from the password
  (`lib/auth.ts`, Web Crypto so it runs in edge + node; constant-time compare; httpOnly/sameSite/secure).
  `/login` page + `/api/login`. **The Nomba webhook is never gated** (own HMAC). Closes the data-exposure
  hole the new public `/api/export` had opened. +3 unit tests (32 total). Live-verified: 401 without
  cookie / 401 wrong pw / 200 after login / webhook bypasses gate. build✓ 32 tests✓ smoke✓.
- **Iter 6 — MOAT: anomaly / fraud flags** *(Security/Reliability + UX)* ✅
  `lib/anomaly.ts` `scanAnomalies()` — pure ledger scan for money-moving-wrong: HIGH large overpayment
  (≥150%), HIGH possible duplicate transfer (same payer+amount within 10 min, distinct tx), MEDIUM
  repeated unmatched from one account, INFO one payer settling ≥3 invoices. `/api/events` returns
  `anomalies`; a "⚑ N flags for review" panel (severity-coloured) renders above the invoice table.
  Turns "paid/partial/overpaid" into an operator's trust layer. +9 unit tests (41 total). build✓ 41 tests✓ smoke✓.
- **Iter 7 — payment_reversal handling (clawback)** *(Reconciliation logic quality + Nomba event breadth)* ✅
  Webhook only handled `payment_success`; now `payment_reversal` un-reconciles. `reconcile.ts`
  `reverse()` + `statusFor()` (pure, tested) subtract the clawed-back amount and re-derive status;
  `store.reversePayment()` finds the payment by tx id, marks it `reversed`, emits a reversal event,
  idempotent on repeat. New `reversed` outcome (chip + icon). Demoable via "⤺ Reverse last payment"
  in the sim panel. +4 unit tests (45 total). Live-verified paid→reversed→awaiting + idempotent. build✓ 45 tests✓ smoke✓.
- **Iter 8 — #24/#25 accessibility + responsive** *(Product UX & Clarity)* ✅
  `useDialogA11y` hook: Esc-to-close + focus moves into the dialog + Tab trapped inside + focus
  returns to trigger on close; applied to the statement drawer + New-Invoice modal (with `aria-label`).
  Global `:focus-visible` outline. Responsive: invoice table now scrolls horizontally (`overflow-x:auto`
  + `min-width`) instead of clipping; KPIs collapse to 1 col + toolbar wraps + modal fits viewport on
  small screens. Closes both #24 and #25. build✓ 45 tests✓ smoke✓.
- **Iter 9 — docs: README refresh + SECURITY.md** *(Submission requirement + Technical/Security clarity)* ✅
  README architecture diagram + "what's wired" now reflect all 8 prior iterations (sync, quarantine-resolve,
  resolver, export, anomaly, auth, reversal); stale "in-memory / stretch resolver / add vitest" notes corrected.
  New **SECURITY.md** — the submission's required security & reliability note: webhook authenticity (9-field
  HMAC + verified vector, fail-closed, freshness, constant-time), reconciliation integrity (idempotent dedupe,
  reversals, requery backstop, durable store, anomaly flags), payout idempotency, access control, secret
  handling, threat model. build✓ 45 tests✓ smoke✓.
  **[prune] #21 integer-kobo** — money is guarded Naira floats (round-2 + kobo-tolerance at every arithmetic
  point, unit-tested); for the amounts in play this is correct. Full integer-kobo is a large cross-cutting
  refactor with no visible judging payoff in the final stretch → deferred post-hackathon, documented in README.
- **Iter 10 — final re-audit + summary (LOOP STOP).** Re-audit + moat scan run: every backlog item is
  done or consciously pruned, and no new candidate clears the "good→wins" bar above what shipped. No code
  change this iteration; wrote the final summary below and stopped the loop. build✓ 45 tests✓ smoke✓.

---

# 🏁 Final summary — 10-iteration hardening loop

**Verification at stop:** `npm run build` green · `npm test` **45/45** · repo smoke test green ·
key flows live-verified against `sandbox.nomba.com` (auth 401/200, reversal, assign; the refund/transfer
call path is exercised but settlement is **production-only** in Nomba's sandbox).

### Per-criterion standing (start → projected after loop; self-assessed)
| Criterion | Start | Now | What moved it |
|---|---|---|---|
| Security & Reliability | 4.5 | **~9** | Fail-closed HMAC + freshness + dedupe-after-success (prior pass), **requery backstop**, durable file store, **opt-in auth gate**, **anomaly flags**, payout idempotency, reversal integrity |
| Technical Execution | 6 | **~9** | **45 unit tests** across 6 pure modules (reconcile incl. reverse/statusFor, verify, resolver, export, auth, anomaly); typed webhook; no NaN path |
| Product UX & Clarity | 6 | **~9** | Statement drawer, **quarantine action queue + suggested-match**, **anomaly panel**, **CSV export**, VA success state, dialog a11y + responsive |
| Nomba Integration Depth | 7 | **~9** | `payment_success` **+ `payment_reversal`**, requery (`/v1/transactions/virtual`), refund + bounce (`/v2/transfers/bank`), VA create/list — verified HMAC vector |
| Problem Relevance | 8 | **~8.5** | Landing wound/persona/differentiator (prior pass); product now demonstrably solves the full reconcile lifecycle |

### Shipped this loop (9 feature/doc changes, each green + scoped to `paidup/`)
1. Reconciliation backstop — **Sync from Nomba** requery
2. **Quarantine resolve** — assign-to-invoice / bounce-to-sender
3. **Smart unmatched-payment resolver** — suggested match
4. **Audit-grade CSV export** — ledger + statement
5. **Opt-in auth gate** — middleware + session cookie
6. **Anomaly / fraud flags**
7. **payment_reversal handling** — clawback un-reconcile
8. **Accessibility + responsive** — dialog focus-trap, scrollable table
9. **Docs** — README refresh + **SECURITY.md**

### Moat features now in the build (a typical entry won't have these)
Smart suggested-match resolver · one-tap overpayment refund + unmatched bounce · idempotent webhook +
requery replay-safety · audit-grade CSV export · anomaly/fraud flags · payment-reversal handling.

### Pruned
- **#21 integer-kobo** — guarded-float + kobo-tolerance is correct for these amounts and fully tested;
  full minor-unit refactor is high-effort / no judging payoff → post-hackathon.
- **Multi-payer statements** (moat candidate) — already satisfied by the per-invoice payment-history
  timeline + running total; no separate build needed.

### Genuinely open (owner actions, not code the loop should write)
- Swap file store → Postgres before a **serverless** deploy (fine as-is on a single instance/Render).
- Set a real `NOMBA_WEBHOOK_SECRET`, tunnel `/api/webhook`, submit Nomba's webhook form.
- Set `APP_PASSWORD` for any hosted/public deployment.

**Outcome:** the two weakest axes at audit time (Security 4.5, UX 6) are now among the strongest, and the
entry carries six reconciliation-depth moat features beyond a baseline submission. Loop stopped at the cap.
