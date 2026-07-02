// Server-only Nomba API client. Reads creds from env (.env.local). Caches the access token.
// Endpoints verified from the docs scrape (see ../NOMBA-API-REFERENCE.md).

const BASE = process.env.NOMBA_BASE || "https://sandbox.nomba.com";
const ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID || "";
const SUB_ACCOUNT_ID = process.env.NOMBA_SUB_ACCOUNT_ID || "";
const CLIENT_ID = process.env.NOMBA_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET || "";

export function nombaConfigured(): boolean {
  return Boolean(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60_000) return cachedToken.token;
  const r = await fetch(`${BASE}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId: ACCOUNT_ID },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const j = await r.json();
  if (j.code !== "00") throw new Error(`Nomba auth failed: [${j.code}] ${j.description}`);
  // expiresAt comes back as ISO; tokens last ~30 min. Fall back to 30 min if unparseable.
  const exp = Date.parse(j.data.expiresAt);
  cachedToken = { token: j.data.access_token, expiresAt: Number.isNaN(exp) ? Date.now() + 30 * 60_000 : exp };
  return cachedToken.token;
}

async function authed(path: string, init: RequestInit = {}, retry = false): Promise<any> {
  const token = await getToken();
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      accountId: ACCOUNT_ID,
      ...(init.headers || {}),
    },
  });
  // Expired token mid-call -> drop cache and retry once.
  if (r.status === 401 && !retry) {
    cachedToken = null;
    return authed(path, init, true);
  }
  if (r.status === 429) {
    throw new Error(`Nomba rate limited (429) on ${path}; back off and retry`);
  }
  return r.json();
}

export async function listBanks(): Promise<Array<{ code: string; name: string }>> {
  const j = await authed(`/v1/transfers/banks`, { method: "GET" });
  if (j.code !== "00") throw new Error(`Fetch banks failed: [${j.code}] ${j.description}`);
  return (j.data?.results ?? j.data ?? []) as Array<{ code: string; name: string }>;
}

/** Confirm a recipient account name before sending money (always do this before a transfer). */
export async function lookupBankAccount(accountNumber: string, bankCode: string): Promise<{ accountNumber: string; accountName: string }> {
  const j = await authed(`/v1/transfers/bank/lookup`, { method: "POST", body: JSON.stringify({ accountNumber, bankCode }) });
  if (j.code !== "00") throw new Error(`Account lookup failed: [${j.code}] ${j.description}`);
  return j.data;
}

export interface CreateVAResult {
  accountRef: string;
  acctNumber: string;
  acctName: string;
  bankName: string;
}

/** Create a dynamic virtual account scoped to the collections sub-account. */
export async function createVirtualAccount(opts: {
  accountRef: string;
  accountName: string;
  expectedAmount?: number; // NOTE: setting this makes the sender's bank reject mismatches — usually leave unset.
  expiryDate?: string;
}): Promise<CreateVAResult> {
  const path = SUB_ACCOUNT_ID ? `/v1/accounts/virtual/${SUB_ACCOUNT_ID}` : `/v1/accounts/virtual`;
  const body: Record<string, unknown> = {
    accountRef: opts.accountRef,
    accountName: opts.accountName,
    currency: "NGN",
  };
  if (opts.expiryDate) body.expiryDate = opts.expiryDate;
  if (opts.expectedAmount != null) body.expectedAmount = opts.expectedAmount;

  const j = await authed(path, { method: "POST", body: JSON.stringify(body) });
  if (j.code !== "00") throw new Error(`Create VA failed: [${j.code}] ${j.description}`);
  return {
    accountRef: j.data.accountRef,
    acctNumber: j.data.bankAccountNumber,
    acctName: j.data.bankAccountName,
    bankName: j.data.bankName,
  };
}

/** A credit into a virtual account, normalized from the transactions/reporting endpoint. */
export interface NombaCreditTxn {
  transactionId: string;
  aliasAccountReference: string | null;
  amount: number;
  sender: string;
  senderAccountNumber?: string;
  senderBankCode?: string;
  bankName?: string;
  narration?: string;
  time?: string;
}

// The reporting endpoint's field names drift from the webhook's, so map defensively.
function pick<T = string>(o: Record<string, unknown> | null | undefined, ...keys: string[]): T | undefined {
  if (!o) return undefined;
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k] as T;
  return undefined;
}

function mapCredit(o: Record<string, unknown>, fallbackRef: string | null): NombaCreditTxn | null {
  const transactionId = pick<string>(o, "transactionId", "id", "reference", "sessionId");
  if (!transactionId) return null;
  const amount = Number(pick(o, "transactionAmount", "amount", "creditAmount", "value"));
  if (!Number.isFinite(amount) || amount <= 0) return null; // skip debits / malformed
  return {
    transactionId,
    aliasAccountReference: pick<string>(o, "aliasAccountReference", "accountRef", "alias") ?? fallbackRef,
    amount,
    sender: pick<string>(o, "senderName", "customerName", "sender", "originatorName") ?? "Unknown",
    senderAccountNumber: pick<string>(o, "senderAccountNumber", "accountNumber", "originatorAccountNumber"),
    senderBankCode: pick<string>(o, "senderBankCode", "bankCode", "originatorBankCode"),
    bankName: pick<string>(o, "bankName", "senderBankName"),
    narration: pick<string>(o, "narration", "description"),
    time: pick<string>(o, "time", "dateCreated", "transactionDate", "createdAt"),
  };
}

/**
 * Reconciliation backstop: pull the credits Nomba recorded for one virtual account.
 * Used to repair the ledger if a webhook was ever missed — never trust webhooks alone.
 * `fallbackRef` (the invoice id we queried for) is used when the row omits aliasAccountReference.
 */
export async function getVirtualAccountTransactions(
  acctNumber: string,
  fallbackRef: string | null = null,
): Promise<NombaCreditTxn[]> {
  const j = await authed(
    `/v1/transactions/virtual?virtual_account=${encodeURIComponent(acctNumber)}&limit=50`,
    { method: "GET" },
  );
  if (j.code !== "00") throw new Error(`Fetch VA txns failed: [${j.code}] ${j.description}`);
  const rows: unknown[] = j.data?.results ?? j.data?.transactions ?? (Array.isArray(j.data) ? j.data : []);
  return rows
    .map((r) => mapCredit(r as Record<string, unknown>, fallbackRef))
    .filter((x): x is NombaCreditTxn => x !== null);
}

/**
 * Refund/payout an overpayment or misdirected transfer back to the payer's bank account.
 * `idempotencyKey` MUST be stable for a given logical refund (e.g. the originating transactionId)
 * so a retried call is deduped by Nomba — never derive it from Date.now().
 */
export async function transferToBank(opts: {
  amount: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  narration: string;
  idempotencyKey: string;
  senderName?: string;
}): Promise<any> {
  const j = await authed(`/v2/transfers/bank`, {
    method: "POST",
    headers: { "X-Idempotent-key": opts.idempotencyKey },
    body: JSON.stringify({
      amount: opts.amount,
      accountNumber: opts.accountNumber,
      accountName: opts.accountName,
      bankCode: opts.bankCode,
      merchantTxRef: opts.idempotencyKey,
      senderName: opts.senderName || "PaidUp",
      narration: opts.narration,
    }),
  });
  // Like every other Nomba call, check the envelope — a 200 is not success.
  if (j.code !== "00") throw new Error(`Transfer failed: [${j.code}] ${j.description}`);
  // data.status: SUCCESS (settled) | PENDING_BILLING (async — confirm later via payout webhook) |
  // REFUND (failed + auto-refunded). Only SUCCESS is a confirmed settlement; treat anything else as
  // NOT a completed transfer so callers never report a live refund that didn't actually move money.
  if (j.data?.status !== "SUCCESS") throw new Error(`Transfer not settled (status: ${j.data?.status ?? "unknown"})`);
  return j.data;
}
