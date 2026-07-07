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

// Hard ceiling on every Nomba call. Without it a slow/hung upstream would hold the request open
// indefinitely (no default fetch timeout in Node), tying up a connection and blocking withdraw/
// refund/invoice routes. On a transfer this fails in the SAFE direction: the write-ahead reserve
// is already recorded, so the caller treats a timeout as "not settled" and the money stays reserved
// on the ledger until sync/requery reconciles it — never silently released.
const TIMEOUT_MS = Number(process.env.NOMBA_TIMEOUT_MS || 20_000);

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error(`Nomba request timed out after ${timeoutMs}ms: ${url.replace(BASE, "")}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60_000) return cachedToken.token;
  const r = await fetchWithTimeout(`${BASE}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId: ACCOUNT_ID },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Nomba auth ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  if (j.code !== "00") throw new Error(`Nomba auth failed: [${j.code}] ${j.description}`);
  // expiresAt comes back as ISO; tokens last ~30 min. Fall back to 30 min if unparseable.
  const exp = Date.parse(j.data.expiresAt);
  cachedToken = { token: j.data.access_token, expiresAt: Number.isNaN(exp) ? Date.now() + 30 * 60_000 : exp };
  return cachedToken.token;
}

async function authed(path: string, init: RequestInit = {}, retry = false): Promise<any> {
  const token = await getToken();
  const r = await fetchWithTimeout(`${BASE}${path}`, {
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
  // A 5xx / gateway page isn't JSON — surface the status + snippet instead of a bare SyntaxError.
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Nomba ${r.status} on ${path}: ${body.slice(0, 200)}`);
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
  const d = j.data ?? {};
  // Field names drift between environments; map defensively and NEVER store an empty bank —
  // every payer-facing surface renders bankName verbatim. Env override for the real issuer label.
  return {
    accountRef: d.accountRef,
    acctNumber: d.bankAccountNumber ?? d.accountNumber,
    acctName: d.bankAccountName ?? d.accountName ?? opts.accountName,
    bankName: d.bankName ?? d.bank_name ?? process.env.NOMBA_VA_BANK_NAME ?? "Nomba",
  };
}

/**
 * Real settled money in the collections sub-account. VAs hold no balance of their own —
 * every credit sweeps into the sub-account, so this is the ground-truth "cash at Nomba" figure
 * the ledger's collected total should tie out against.
 */
export async function getSubAccountBalance(): Promise<{ amount: number; currency: string }> {
  if (!SUB_ACCOUNT_ID) throw new Error("No NOMBA_SUB_ACCOUNT_ID set");
  const j = await authed(`/v1/accounts/${SUB_ACCOUNT_ID}/balance`, { method: "GET" });
  if (j.code !== "00") throw new Error(`Fetch balance failed: [${j.code}] ${j.description}`);
  const amount = Number(j.data?.amount);
  if (!Number.isFinite(amount)) throw new Error("Balance response missing a numeric amount");
  return { amount, currency: j.data?.currency || "NGN" };
}

/**
 * Expire the Nomba-side virtual account when its invoice is deleted, so the NUBAN dies with
 * the reference (a payer's bank then rejects it at name-enquiry instead of sending money to a
 * freed account). Identifier is the accountRef (= our invoice id). Verified working on
 * production 2026-07-04; sandbox used to 403 this endpoint.
 */
export async function deleteVirtualAccount(accountRef: string): Promise<boolean> {
  const j = await authed(`/v1/accounts/virtual/${encodeURIComponent(accountRef)}`, { method: "DELETE" });
  if (j.code !== "00") throw new Error(`Expire VA failed: [${j.code}] ${j.description}`);
  return j.data?.expired === true;
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
 * Requery the bank-network record for a settled transfer by its sessionId — the authoritative
 * second source PaidUp checks against its own ledger. Read-only; never mutates money.
 */
export async function requery(sessionId: string): Promise<any> {
  const j = await authed(`/v1/transactions/requery/${encodeURIComponent(sessionId)}`, { method: "GET" });
  if (j.code !== "00") throw new Error(`Requery failed: [${j.code}] ${j.description}`);
  return j.data;
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
  // Scope the payout to our sub-account per Nomba's verified hackathon endpoint
  // (POST /v2/transfers/bank/{subAccountId}); fall back to the un-scoped path if no sub-account is set.
  const path = SUB_ACCOUNT_ID ? `/v2/transfers/bank/${SUB_ACCOUNT_ID}` : `/v2/transfers/bank`;
  const j = await authed(path, {
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
  // The transfer's REAL outcome is data.status — NOT the envelope `code`. The envelope code is
  // inconsistent across Nomba endpoints/environments: the docs say "00" = success, but the live
  // /v2/transfers/bank returns code "200" with description "SUCCESS" on a genuinely SETTLED transfer.
  // Gating on `code === "00"` therefore threw on real, successful refunds/payouts — reporting them as
  // failures while the money actually LEFT, and a retry then hit Nomba's duplicate-transaction guard.
  // So: trust data.status, the documented settlement signal, and never reject on `code` alone.
  //   SUCCESS = settled · PENDING_BILLING = async, confirm via payout webhook/requery · REFUND = failed + auto-refunded.
  // Only SUCCESS is a confirmed settlement; the error keeps the status WORD so callers can branch
  // (withdraw frees the reserve only on a provable REFUND; PENDING_BILLING stays reserved/in-flight).
  const status = j.data?.status;
  if (status !== "SUCCESS") {
    throw new Error(`Transfer not settled: [${j.code}] ${j.description ?? ""} (status: ${status ?? "unknown"})`);
  }
  return j.data;
}
