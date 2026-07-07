# UX Sweep — Design Spec (2026-07-04)

## Goal
Make PaidUp intuitive and seamless end-to-end for BOTH audiences equally: hackathon judges/reviewers
walking the product, and a real Nigerian SME owner (plus their invoice-paying customer). Scope is
**polish + friction fixes only** — no structural flow changes, no navigation rework, and absolutely
no changes to the money path (`lib/reconcile.ts`, `lib/verify.ts`, `lib/store.ts` mutation logic).

## Constraints
- App is live at https://paidup.site (VPS, production mode) and proven with real money — nothing may
  destabilize the demo 3 days before the July 7 final submission.
- **No git commits or pushes** (standing hold while the progress-submission review is live). All work
  stays in the working tree and deploys to the VPS via tarball + `npm run build` + `systemctl restart paidup`.
- Keep `npm test` (125) green and `tsc --noEmit` clean after every batch.
- Design language "The Ledger" (CSS vars in `app/globals.css`, Fraunces/Hanken Grotesk/JetBrains Mono)
  is the consistency reference — fixes align TO it, never introduce new styling systems.

## Audit method (already performed)
Six journeys walked in code by me + two read-only Explore agents (customer-facing pages; auth/onboarding):
signup→first invoice · invoice→payment→reconciled · overpaid→refund · unmatched→resolve ·
customer pay-page journey · returning-user daily check, plus a cross-cutting consistency scan.

## The fixes — 5 batches, ranked by user impact

### Batch 1 — Stale & broken copy
| # | File | Fix |
|---|------|-----|
| 1 | `app/app/page.tsx` (~line 101) | Empty feed state references the retired Simulate panel. New copy: create-first-invoice framing + a link/button to `/app/invoices?new=1`. |
| 2 | `app/pay/[token]/invoice/page.tsx` (~line 76) | Printed invoice shows a relative pay URL. Render the absolute URL from the request/runtime origin (works for paidup.site AND localhost — do not hardcode a domain). |
| 3 | `app/app/invoices/page.tsx` delete-confirm copy (~line 430) | Update to reflect VA expiry shipped 2026-07-04: the Nomba account number is closed on delete (when `vaLive`); late transfers to a mock/legacy VA still quarantine. |

### Batch 2 — Silent failures & wrong feedback
| # | File | Fix |
|---|------|-----|
| 4 | `app/app/invoices/page.tsx` `InvoiceDrawer.doRefund` | `refund()` returns null on failure and the UI ignores it. Add inline error state: "Refund didn't go through — Nomba may still be settling. Try again shortly." Clear on retry/success. |
| 5 | `app/app/invoices/page.tsx` `QuarantineRow` assign/bounce | Same pattern: inline error note on null result ("Couldn't assign — try again" / "Bounce failed — sender details may be missing"). |
| 6 | `components/dashboard.tsx` `useDashboard.refresh` | On a 401 from `/api/events`, redirect to `/login?next=<current path>` instead of showing the eternal "Lost connection" banner (session-expiry UX). Non-401 errors keep the current banner. |
| 7 | `app/app/invoices/page.tsx` `NewInvoiceModal` | Wrap fields in a `<form onSubmit>` so Enter submits (parity with login/signup). Keep the busy guard. |
| 8 | `app/app/invoices/page.tsx` empty states | When `filter === "attn"`: if quarantine items exist but no overpaid rows → "No overpaid invoices — the unmatched payments above are the open items." If neither → "Nothing needs attention 🎉". |

### Batch 3 — Happy-path accessibility
| # | File | Fix |
|---|------|-----|
| 9 | `app/app/page.tsx` page-head + `app/app/invoices/page.tsx` | "+ New invoice" button on the Live feed page-head → `/app/invoices?new=1`; invoices page reads `new=1` on mount (same pattern as `filter=`) and opens the modal. |
| 10 | `app/app/invoices/page.tsx` `NewInvoiceModal` success card | Add "Copy pay link" (`window.location.origin + /pay/<payToken>`) beside the account-number copy and PDF link. |
| 11 | `app/login/page.tsx` | Quiet reviewer affordance under the form: "Exploring? Use the demo workspace →" — one click prefills demo@paidup.app / LedgerDemo2026 and submits. (Creds are already public in DEMO.md; this is deliberate.) |
| 12 | `app/app/page.tsx` Top outstanding card | Wrap rows in `Link` to `/app/invoices?filter=open`. |

### Batch 4 — Customer pay page (mobile-first)
| # | File | Fix |
|---|------|-----|
| 13 | `app/pay/[token]/page.tsx` + `globals.css` | Mobile (≤640px): account details visually primary; QR keeps working but gains hint "On this phone? Use the account number above." |
| 14 | `globals.css` | ≤380px: `.pay-acct` stacks vertically, copy button full-width; `.copy` tap target ≥44px on ≤640px. |
| 15 | `app/pay/[token]/page.tsx` | `sr-only` span with the account number adjacent to the QR for screen readers. |
| 16 | `app/pay/[token]/page.tsx` paid state | "✓ Payment received and matched — you're all set." + keep receipt link. |
| 17 | `app/pay/[token]/page.tsx` footer | "Payments secured by Nomba · transfers from any Nigerian bank." |

### Batch 5 — Consistency & a11y polish
| # | File | Fix |
|---|------|-----|
| 18a | `globals.css` | `:focus-visible` outlines for `.modal input` and `.ob-card input` (2px `var(--ink)` or accent, offset 2px). |
| 18b | `app/signup/page.tsx`, `app/login/page.tsx` | `minLength={8}` on signup password; show/hide password toggle on both (plain text button "show"/"hide", styled with existing vars). |
| 18c | `app/get-started/page.tsx` | Replace undefined `var(--reversed-ink, #b4442f)` with `var(--attn)`; remove inline opacity that doubles with `button:disabled`. |

## Pruned (do NOT do, with reasons)
- Landing-page jargon rewrite — "HMAC verified / audit-grade" is deliberate judge-facing signal (GAPS #13/#14).
- localStorage form persistence for session expiry — beyond polish; fix #6 covers the confusion.
- Currency selector — NGN-only is the MVP decision.
- Wizard re-entry guard / onboarding flags — structural; the wizard is idempotent enough for now.
- SSE instead of 2s polling — pruned long ago, stays pruned.

## Verification & rollout
1. After each batch: `npx tsc --noEmit` + `npm test` (125 must stay green — none of these files are tested, so count stays 125).
2. After all batches: local dev spot-check of each changed flow (dev server on :3100).
3. Deploy: tarball working tree (exclude node_modules/.next/.git/.data/.env.local) → VPS `/root/paidup` →
   `npm run build` → `systemctl restart paidup` (never build locally while dev runs — .next collision).
4. Live smoke on https://paidup.site: empty-state copy (fresh signup), new-invoice via `?new=1`, pay page
   on mobile viewport, login demo prefill, 401-redirect (forge by clearing cookie), refund-error path left
   untested live (needs a real overpayment — verify by code review only).
5. No git commit (standing hold). GAPS.md gets a dated changelog line.

## Success criteria
A first-time visitor can: sign up → create an invoice → send the pay link → see the payment reconcile,
without hitting a stale instruction, a dead end, a silent failure, or an unreadable screen on a phone.
A judge can reach the demo workspace from the login page in one click.
