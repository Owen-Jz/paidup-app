# PaidUp — 5-minute demo script

The submission's demo video walkthrough. Organizer guidance (Slack, 2026-07-06): **"keep it to
5 minutes and cover everything."** Optimised for the judging rubric: **reconciliation quality,
under/overpayment handling, customer-level reporting clarity** — plus the AI moat. Lead with the
wound, show the engine end to end (money in → reconciled → money out), end on the moat.

## Before you record (2 minutes of setup)

**The demo runs live at https://paidup.site** — production hosting, real Nomba production creds,
the real webhook tunnel. No local setup needed.

- **Judge/demo login: `demo@paidup.app` / `LedgerDemo2026`** (also in README.md — put it in the
  submission form too, per the organizers).
- The webhook endpoint submitted to Nomba (`https://rimose-rayan-better.ngrok-free.dev/api/webhook`)
  is served from the same host — a real bank transfer on camera reconciles live. **Both systemd
  services (`paidup`, `ngrok-paidup`) must be active** — check `systemctl is-active paidup ngrok-paidup`
  on the VPS before recording.
- Have ready:
  1. A browser signed in to the **demo workspace** with two tabs: `/` (the story) and `/app` (live feed).
  2. A **phone with a real banking app** (OPay/GTBank/any) for the money shot — sandbox VAs are NOT
     reachable from real banks; production VAs are, and the creds on the VPS are production.
  3. A terminal with the signed-webhook script ready (fallback + range demo):
     ```bash
     NOMBA_WEBHOOK_SECRET=<key> node scripts/send-signed-webhook.mjs \
       https://rimose-rayan-better.ngrok-free.dev/api/webhook <INV-ref> <amount>
     ```
- `MINIMAX_API_KEY` is set on the host, so the **✨ AI LIVE** pill shows and AI features are real.
  If it were absent everything still works — deterministic fallbacks, pill reads **AI OFF · RULES**.
  The demo never breaks.
- Record at 1280×800 or higher. Phone screen-record (or camera over the shoulder) for the transfer beat.

## The script (≤ 5:00)

**0:00 — The wound (landing, `/`)**  *(~30s)*
> "Every Nigerian SME has the same problem: customers pay by bank transfer with no usable reference —
> 'Payment, no invoice ref' — and someone reconciles it by hand at midnight."

Scroll the landing's story band (before/after → the loop). Land on the one-line thesis:
**the account number IS the reference.**

**0:30 — One invoice, one account (`/app/invoices` → New Invoice)**  *(~40s)*
> "Create an invoice — customer, amount, an optional due date — and it gets its own dedicated Nomba
> **production** virtual account, minted live on the API. The customer just sends money; nothing to type."

Show the create flow → the success state with the **big virtual-account number + Copy**. Point at the
due-date chip on the new row ("Due in 7d"). Mention: every invoice gets its own VA — that's the
"Virtual Accounts as Infrastructure" track, literally.

**1:10 — The customer's side (`/pay/<token>`)**  *(~25s)*
Open the invoice's pay link (or scan its QR on camera).
> "This is what the customer gets — the account details, a QR, and a **WhatsApp share** so the invoice
> travels the way Nigerian business actually talks. Leave this page open — watch it."

**1:35 — Money lands, auto-reconciles**  *(~50s)*  ← the wow moment
On the phone, make a **real transfer** (₦100–₦500) from a real banking app to the VA on screen.
Split-screen or cut between: the **live feed** (`/app`) and the still-open **pay page**.
> "That's a real interbank transfer. Nomba fires a `payment_success` webhook, PaidUp verifies the
> **9-field HMAC signature**, matches by the virtual-account reference, and reconciles — watch the
> feed… **paid**. And the customer's pay page just flipped to **settled** on its own — no refresh.
> No manual matching happened anywhere."

*(Fallback if recording without a phone: fire the signed-webhook script at the live endpoint — it's
the identical verified-HMAC path, not a shortcut.)*

**2:25 — The full range: partial, overpaid, refund**  *(~40s)*
Fire the script (or transfers) with under / over amounts against one invoice:
> "Underpayment → **partial**, and the balance accumulates across instalments. Overpayment → **overpaid**
> with the surplus highlighted. One tap — **Refund surplus** — and the extra goes back to the payer via
> Nomba's transfer API with a name-check first and a stable idempotency key. If the transfer doesn't
> settle, the ledger refuses to lie about it."

Open the invoice's **statement drawer**: payment history, running balance, the requery ("verify with
the bank network") action on a payment.

**3:05 — The hard case: unmatched money + AI resolver**  *(~30s)*  ← the moat
Point to the **Attention** queue: a transfer with no matching reference (quarantined, never lost).
Click **✨ Ask AI**:
> "MiniMax reads the narration, amount and sender and tells me which invoice this almost certainly
> pays — in plain English — and I confirm in one click. The AI only *suggests*; it's hard-grounded to
> a real open invoice, so it can't invent anything. No key? It falls back to the rule-based matcher."

Accept the suggestion → the payment reconciles.

**3:35 — Trust: AI brief, anomalies, the tie-out**  *(~25s)*
Hit **Generate brief** on the **✨ AI reconciliation brief** card:
> "A plain-English read on the whole ledger — over the *computed* figures, so it can never invent money."

Point at the sync note — **"✓ last synced … · ₦XXX settled at Nomba"**:
> "That figure is live from Nomba's balance API — the ledger ties out against real settled cash, to the naira."

**4:00 — Reporting (`/app/reports/ledger`, `/app/reports/audit`)**  *(~20s)*
> "Customer-level clarity: a print-ready ledger report, per-invoice statements, audit-grade CSV export —
> and a hash-chained audit log, so history can't be quietly rewritten."

**4:20 — Money out (`/app/withdraw`)**  *(~20s)*
> "Collected → reconciled → **paid out to my own bank**. The app confirms the recipient name from Nomba
> before sending, and a write-ahead record means a crash can never double-spend. Money in to money out —
> the loop is closed."

**4:40 — Receipt + verification beat**  *(~10s)*
> "The payer gets a receipt with a QR — `/pay/<token>/verify` proves the payment is real. That's the
> answer to fake bank alerts."

**4:50 — Close**  *(~10s)*
> "PaidUp turns Nomba's raw virtual-account primitive into a managed reconciliation ledger — exact,
> partial, overpaid, reversed and unmatched all handled, with AI that sharpens the work but can never
> break the money path. **147 unit tests**, HMAC verified against Nomba's own docs vector, fails closed
> in production — all proven with real money on the live API."

## One-line pitch (for the form)
> Per-invoice Nomba virtual accounts + a reconciliation engine that auto-matches every transfer
> (paid/partial/overpaid/reversed/unmatched), with an AI layer (resolver, anomaly notes, brief) that
> degrades gracefully so a missing key never breaks the demo.

## If something misbehaves on the day
- Feed not updating → the dashboard polls `/api/events` every 2s; check `systemctl status paidup` on
  the VPS (`journalctl -u paidup -n 50` for logs).
- Webhook not landing → `systemctl status ngrok-paidup`; the submitted URL is permanent and must stay
  up through judging (webhook URLs are frozen after the deadline).
- AI button shows "AI not configured" → `MINIMAX_API_KEY` isn't set on the host; the deterministic
  fallback still works.
- Everything re-verifiable in one line: `npm test` (147) · `npm run build` ·
  `node ../smoke-test/smoke-test.mjs`.
