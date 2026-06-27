// Shared domain types. Entity = invoice; accountRef = invoice.id (the reconciliation key).

export type InvoiceStatus = "awaiting" | "partial" | "paid" | "overpaid";
export type PaymentOutcome = InvoiceStatus | "duplicate" | "quarantine" | "refunded" | "reversed";

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
}

export interface Invoice {
  id: string;                // accountRef ↔ webhook aliasAccountReference
  customer: string;
  customerEmail?: string;
  description: string;
  amount: number;            // expected total
  paid: number;              // accumulated received
  status: InvoiceStatus;
  createdAt: string;
  dueLabel?: string;
  // virtual account (from Nomba create response, or mocked in dev)
  acctNumber: string;
  acctName: string;
  bankName: string;
  payments: Payment[];
  // Unguessable token for the public, shareable customer payment page (/pay/<token>). Random, so
  // invoice ids stay un-enumerable from the public surface. (POLISH M1)
  payToken?: string;
}

export interface FeedEvent {
  id: string;                // transactionId
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
