// Shared domain types. Entity = invoice; accountRef = invoice.id (the reconciliation key).

export type InvoiceStatus = "awaiting" | "partial" | "paid" | "overpaid";

// ---- Multi-tenant auth ----------------------------------------------------------------------
// One tenant = one business workspace. One owner-user per tenant (v1 — team members deferred).

export interface Tenant {
  id: string;
  businessName: string; // the beneficiary name payers see; used as the VA accountName
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;         // login identifier (stored lowercase)
  passwordHash: string;  // scrypt — see lib/password.ts
  tokenVersion: number;  // bump to invalidate every outstanding session token
  createdAt: string;
}
export type PaymentOutcome = InvoiceStatus | "duplicate" | "quarantine" | "refunded" | "reversed" | "withdrawal";

// Typed shape of the Nomba payment_success webhook (only the fields we read).
export interface NombaPaymentWebhook {
  event_type?: string;
  requestId?: string;
  data?: {
    merchant?: { userId?: string; walletId?: string };
    transaction?: {
      transactionId?: string;
      type?: string;
      time?: string;
      responseCode?: string;
      transactionAmount?: number | string;
      aliasAccountReference?: string;
      narration?: string;
      sessionId?: string;
    };
    customer?: { senderName?: string; accountNumber?: string; bankCode?: string; bankName?: string };
  };
}

export interface Payment {
  transactionId: string;     // webhook data.transaction.transactionId — dedupe key
  amount: number;
  sender: string;
  senderAccountNumber?: string;
  senderBankCode?: string;
  bankName?: string;
  narration?: string;
  time: string;              // ISO
  outcome: Exclude<PaymentOutcome, "quarantine">;
  sessionId?: string;        // Nomba bank-network session ID — used for requery
}

// A single billed line on an invoice. The invoice's `amount` is the (rounded) SUM of these — line
// items are presentation/metadata; `amount` stays the authoritative reconciliation target.
export interface LineItem {
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;                // accountRef ↔ webhook aliasAccountReference (globally unique)
  tenantId: string;          // owning workspace — every read/mutation is scoped to this
  customer: string;
  customerEmail?: string;
  description: string;
  lineItems?: LineItem[];    // optional itemised breakdown; sum === amount
  amount: number;            // expected total
  paid: number;              // accumulated received
  status: InvoiceStatus;
  createdAt: string;
  dueLabel?: string;
  dueDate?: string;          // ISO — when payment is expected; drives overdue detection + reminders
  // virtual account (from Nomba create response, or mocked in dev)
  acctNumber: string;
  acctName: string;
  bankName: string;
  // true when the VA is a real Nomba-minted account (deleting the invoice can then expire it upstream)
  vaLive?: boolean;
  payments: Payment[];
  // Unguessable token for the public, shareable customer payment page (/pay/<token>). Random, so
  // invoice ids stay un-enumerable from the public surface. (POLISH M1)
  payToken?: string;
}

// A payout of settled collections to the merchant's own bank account.
//   pending  — recorded BEFORE/at the transfer; money may be in flight. Reserves the balance.
//   settled  — Nomba confirmed SUCCESS (live money moved) OR a labelled demo entry.
//   failed   — provably no money left Nomba (pre-debit rejection); frees the reserved balance.
// The balance a tenant can withdraw counts pending + settled (never failed), so an in-flight or
// settled payout can NEVER be spent twice even if the client is told it "failed".
export type WithdrawalStatus = "pending" | "settled" | "failed";
export interface Withdrawal {
  id: string;            // wd_<client ref> — idempotency identity for replays
  tenantId: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;   // bank-confirmed via lookup, never user-typed
  narration: string;
  status: WithdrawalStatus;
  live: boolean;         // true only when real money actually settled (status==="settled" && !demo)
  time: string;          // ISO — created
  updatedAt?: string;    // ISO — last status change
}

export interface FeedEvent {
  id: string;                // transactionId
  tenantId: string;          // matched → the invoice's tenant; unmatched → the receiving workspace
  invoiceId: string | null;  // null = quarantined (no match)
  customer: string;          // matched customer, or the raw sender
  amount: number;
  bankName?: string;
  narration?: string;
  outcome: PaymentOutcome;
  time: string;
  // persisted on quarantined events so they can later be assigned or bounced back to the payer
  senderAccountNumber?: string;
  senderBankCode?: string;
}
