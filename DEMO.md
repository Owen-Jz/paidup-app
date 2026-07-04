# PaidUp — 2–3 minute demo script

The submission's demo video walkthrough. Optimised for the judging rubric: **reconciliation quality,
under/overpayment handling, customer-level reporting clarity** — plus the AI moat. Lead with the wound,
show the engine, end on the moat.

## Before you record (60 seconds of setup)
```bash
cd paidup
rm -f .data/ledger.json     # reset to the clean seed ledger
npm run dev                 # http://localhost:3100
```
- **Sign in first** — the app is a real multi-tenant SaaS now. The populated demo workspace:
  **`demo@paidup.app` / `LedgerDemo2026`** (override the password with `DEMO_PASSWORD`). Or sign up
  fresh at `/signup` to show an empty, isolated workspace. `.env.local` needs `SESSION_SECRET` set.
- `.env.local` should have the TEST Nomba creds + `NOMBA_WEBHOOK_SECRET=<your Nomba webhook signing key>` + `MINIMAX_API_KEY`
  (so the **✨ AI LIVE** pill shows and the AI features are real). If the AI key is absent, everything still
  works — the app falls back to the deterministic engine and the pill reads **AI OFF · RULES**. The demo never breaks.
- **To show the REAL Nomba webhook path** (recommended — it's a scored security criterion), also have the
  tunnel up so `/api/webhook` is reachable and the HMAC check is live:
  ```bash
  ngrok http --url=rimose-rayan-better.ngrok-free.dev 3100
  ```
- Record at 1280×800+. Have two browser tabs ready: `/` (story) and `/app` (the live feed).

## The script

**0:00 — The wound (landing, `/`)**  *(~20s)*
> "Every Nigerian SME has the same problem: customers pay by bank transfer with no usable reference —
> 'Payment, no invoice ref' — and someone reconciles it by hand at midnight."

Scroll the landing's before/after band. Land on the one-line thesis: **the account number IS the reference.**

**0:20 — One invoice, one account (`/get-started` → New Invoice)**  *(~25s)*
> "Create an invoice and it gets its own dedicated Nomba virtual account. The customer just sends money —
> nothing to type."

Show the create flow → the success state with the **big virtual-account number + Copy**. Note: a real
sandbox NUBAN is minted (falls back to a mock only if the Nomba call fails, so the demo never breaks).

**0:45 — Money lands, auto-reconciles (`/app`, the live feed)**  *(~35s)*  ← the wow moment
Show the real path first, then the full range:
1. **The REAL Nomba path (proves the integration):** in a terminal, fire one genuinely HMAC-signed
   webhook at the live endpoint —
   ```bash
   node scripts/send-signed-webhook.mjs https://rimose-rayan-better.ngrok-free.dev/api/webhook INV-1044 75500
   ```
   → it passes the **9-field signature check** and INV-1044 flips to **paid** live in the feed. This is the
   *actual* Nomba webhook path (verified HMAC, matched by `aliasAccountReference`) — **not** a demo shortcut.
   *(With PRODUCTION creds in `.env.local`, the ultimate version: a real ₦100–₦150 bank transfer from a
   real banking app into a freshly minted production VA — same flow, actual money on camera. Sandbox VAs
   are NOT reachable from real bank apps — name-enquiry fails.)*
2. **The full range (fast):** fire the same script with under / over amounts against one invoice so the
   engine shows **paid**, **partial** (balance accumulates), **overpaid** (surplus highlighted) in
   seconds. (The in-app simulate panel was retired when production went live — the signed script IS the
   simulator, and it exercises the identical verified-webhook path.)
> "That was a real signed webhook — no refresh, no manual matching, matched by the virtual-account
> reference and reconciled the instant it lands. A forged signature is rejected; nothing else touches the ledger."

**1:20 — Under/overpayment handling + one-tap refund (`/app/invoices`)**  *(~25s)*
Click the overpaid invoice → the **statement drawer**: payment history, running balance, the VA number.
Hit **Refund surplus** → the overpayment goes back via `/v2/transfers/bank` (lookup→transfer, stable
idempotency key). In the demo it's recorded and labelled **not-settled** (sandbox transfers are
production-only); in production it only marks refunded on a confirmed `SUCCESS` — never a phantom.
> "The surplus goes back to the payer in one tap — and if the transfer doesn't settle, the ledger
> refuses to lie about it."

**1:45 — The hard case: unmatched money + AI resolver**  *(~30s)*  ← the moat
Point to the **Attention** queue: a transfer with no matching reference (quarantined, never lost).
Click **✨ Ask AI**:
> "MiniMax reads the narration, amount and sender, and tells me which invoice this almost certainly
> pays — in plain English — and I confirm in one click. The AI only *suggests*; it's hard-grounded to a
> real open invoice, so it can't invent anything. No key? It falls back to the rule-based matcher."

Accept the suggestion → the payment reconciles. (Optionally show **⚑ Explain with AI** turning a flag into
a recommended action.)

**2:15 — AI brief + trust (`/app`)**  *(~20s)*
On the live page, hit **Generate brief** on the **✨ AI reconciliation brief** card.
> "A plain-English read on the whole ledger — collected, outstanding, what needs me — over the *computed*
> figures, so it can never invent money."

Tap the **✨ AI LIVE** pill / mention **fail-closed webhook HMAC** and the **anomaly flags**.

**2:35 — Close**  *(~15s)*
> "PaidUp turns Nomba's raw virtual-account primitive into a managed reconciliation ledger — exact,
> partial, overpaid, reversed and unmatched all handled, with AI that sharpens the work but can never
> break the money path. 107 unit tests, HMAC verified against Nomba's own vector, fails closed in production."

## One-line pitch (for the form)
> Per-invoice Nomba virtual accounts + a reconciliation engine that auto-matches every transfer
> (paid/partial/overpaid/reversed/unmatched), with an AI layer (resolver, anomaly notes, brief) that
> degrades gracefully so a missing key never breaks the demo.

## If something misbehaves on the day
- Feed not updating → the dashboard polls `/api/events` every 2s; check the dev server is up on :3100.
- AI button shows "AI not configured" → `MINIMAX_API_KEY` isn't set; the deterministic fallback still works.
- Want a clean slate mid-demo → `rm .data/ledger.json` and reload (re-seeds).
- Reset everything verified: `npm test` (107) · `npm run build` · `node ../smoke-test/smoke-test.mjs`.
