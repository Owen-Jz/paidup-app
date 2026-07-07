"use client";

import { useEffect, useRef, useState } from "react";
import { NGN, timeAgo } from "@/lib/format";

// The payout section: your settled collections out to your own bank (Access, UBA, Opay — any
// Nigerian bank). The form is inline (no buried modal). Server enforces everything that matters:
// per-tenant ceiling, real-balance cap, bank-confirmed recipient name, idempotent refs.

interface WithdrawInfo {
  operator: boolean;
  configured: boolean;
  balance: { amount: number; currency: string } | null;
  withdrawable: number;
  banks: Array<{ code: string; name: string }>;
  withdrawals: Array<{
    id: string; amount: number; bankCode: string; accountNumber: string;
    accountName: string; live: boolean; status?: "pending" | "settled" | "failed"; time: string;
  }>;
}

const newRef = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);

export default function WithdrawPage() {
  const [info, setInfo] = useState<WithdrawInfo | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  // One ref per payout attempt = the idempotency identity; a retried submit can never pay twice.
  // Regenerated only AFTER a payout succeeds, so the next one is a fresh intent.
  const refId = useRef<string>(newRef());
  // Typeable bank picker: users search by the name THEY know ("Opay"), while the NIP directory
  // may list the corporate name ("Paycom (Opay)"). Datalist matches substrings, so both work.
  const [bankQuery, setBankQuery] = useState("");
  const [acct, setAcct] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ accountName: string; amount: number; status: string } | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/withdraw", { cache: "no-store" });
      if (!r.ok) { setLoadErr(true); return; }
      const j = (await r.json()) as WithdrawInfo;
      setInfo(j);
    } catch { setLoadErr(true); }
  };
  useEffect(() => { load(); }, []);

  // Resolve the typed bank to its NIP code: exact name match first, then a unique
  // substring match ("opay" → "Paycom (Opay)"), else a bare numeric code typed directly.
  const resolveBank = (): { code: string } | { error: string } => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return { error: "Pick your bank — start typing its name." };
    const banks = info?.banks ?? [];
    const exact = banks.find((b) => b.name.toLowerCase() === q);
    if (exact) return { code: exact.code };
    const partial = banks.filter((b) => b.name.toLowerCase().includes(q));
    if (partial.length === 1) return { code: partial[0].code };
    if (partial.length > 1) return { error: `"${bankQuery}" matches ${partial.length} banks — pick one from the list.` };
    if (/^\d{3,6}$/.test(q)) return { code: q };
    return { error: `No bank matches "${bankQuery}" — try another spelling (e.g. Opay is listed as "Paycom (Opay)").` };
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amt = parseFloat(amount);
    const bank = resolveBank();
    if ("error" in bank) { setErr(bank.error); return; }
    const bankCode = bank.code;
    if (!/^\d{10}$/.test(acct) || !amt || amt <= 0) {
      setErr("Enter a 10-digit account number and a positive amount."); return;
    }
    if (info && amt > info.withdrawable) {
      setErr(`That's more than your settled collections (${NGN(info.withdrawable)}).`); return;
    }
    setBusy(true); setErr(""); setDone(null);
    let j: any = null;
    try {
      const r = await fetch("/api/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refId.current, amount: amt, bankCode, accountNumber: acct }),
      });
      j = await r.json().catch(() => null);
      if (!r.ok) {
        // Surface the server's actual reason. Do NOT reuse this ref — a fresh attempt is a new intent.
        setErr(j?.error || `Withdrawal failed (${r.status}).`);
        refId.current = newRef();
        return;
      }
    } catch {
      // Network died mid-request: the payout MAY have reached Nomba. Never say "nothing sent".
      setErr("Connection dropped before we got a result. If the amount left your available balance, the payout is in flight — refresh before retrying so you don't send twice.");
      return; // keep the same ref so a retry Nomba-dedupes
    } finally {
      setBusy(false);
    }
    setDone({ accountName: j.withdrawal.accountName, amount: j.withdrawal.amount, status: j.status || (j.live ? "settled" : "pending") });
    refId.current = newRef(); // next payout is a new intent
    setAmount("");
    load();
  };

  const last = info?.withdrawals[0];

  return (
    <main>
      <div>
        <h1 className="h1">Withdraw</h1>
        <p className="sub">Pay your settled collections out to your own bank account — every payout is name-confirmed with the bank before money moves, and lands in the audit trail.</p>
      </div>

      {loadErr && <div className="banner err" role="alert">⚠ Couldn&apos;t load your payout details — refresh to retry.</div>}

      <div className="kpis">
        <div className="kpi accent">
          <div className="lab">Available to withdraw</div>
          <div className="val naira">{info ? NGN(info.withdrawable) : "…"}</div>
          <div className="delta">your workspace&apos;s settled collections</div>
        </div>
        {info?.operator && (
          <div className="kpi">
            <div className="lab">Settled at Nomba (all workspaces)</div>
            <div className="val naira">{info.balance ? NGN(info.balance.amount) : "—"}</div>
            <div className="delta">ground truth — the shared settlement account</div>
          </div>
        )}
        <div className="kpi">
          <div className="lab">Last payout</div>
          <div className="val naira">{last ? NGN(last.amount) : "—"}</div>
          <div className="delta">{last ? `${last.accountName} · ${timeAgo(last.time)}${last.live ? "" : " · demo"}` : "no payouts yet"}</div>
        </div>
      </div>

      <div className="modal" style={{ width: "min(560px, 100%)", marginTop: 20 }}>
        {done && (
          <div className="banner" role="status" style={{ marginBottom: 16, background: "var(--paper-2)", border: "1px solid var(--line-2)", borderRadius: 10, padding: "12px 14px" }}>
            {done.status === "settled"
              ? <>✅ <b>Payout sent</b> — {NGN(done.amount)} to <b>{done.accountName}</b>, settled over Nomba. Check your bank alert.</>
              : done.status === "pending"
              ? <>⏳ <b>Payout in flight</b> — {NGN(done.amount)} to <b>{done.accountName}</b>. The amount is reserved so it can&apos;t be sent twice; it&apos;ll show Settled once Nomba confirms.</>
              : <>🧾 <b>Payout recorded (demo)</b> — {NGN(done.amount)} to <b>{done.accountName}</b>. Live transfers are disarmed on this server.</>}
          </div>
        )}
        <form onSubmit={submit}>
          <h3>Send to your bank</h3>
          <label htmlFor="wd-bank">Bank — type to search</label>
          <input id="wd-bank" list="wd-banks" value={bankQuery} onChange={(e) => setBankQuery(e.target.value)}
            placeholder={'e.g. "Opay", "Access", "UBA" — wallets count too'} autoComplete="off" />
          <datalist id="wd-banks">
            {(info?.banks ?? []).map((b) => <option key={b.code} value={b.name} />)}
          </datalist>
          <label htmlFor="wd-acct">Account number</label>
          <input id="wd-acct" value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit NUBAN" inputMode="numeric" />
          <label htmlFor="wd-amt">Amount (₦)</label>
          <input id="wd-amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={info && info.withdrawable > 0 ? `up to ${Math.floor(info.withdrawable)}` : "e.g. 200"} />
          {err && <div role="alert" style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="btn" type="submit" disabled={busy || !info || info.withdrawable <= 0}>
              {busy ? "Sending…" : "↗ Withdraw"}
            </button>
          </div>
          <p className="sub" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Nomba charges a small transfer fee (~₦20) on top of the amount. The recipient name is
            confirmed with the bank first, and the amount is reserved the moment you submit — so a
            payout can never be sent twice, even if the connection drops.
          </p>
        </form>
      </div>

      {info && info.withdrawals.length > 0 && (
        <div className="tablewrap" style={{ marginTop: 22 }}>
          <table className="inv">
            <thead>
              <tr><th>When</th><th>To</th><th>Account</th><th className="right">Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {info.withdrawals.map((w) => (
                <tr key={w.id}>
                  <td><small style={{ color: "var(--muted)" }}>{timeAgo(w.time)}</small></td>
                  <td><b>{w.accountName}</b></td>
                  <td><span className="mono" style={{ color: "var(--ink-2)" }}>{w.accountNumber}</span></td>
                  <td className="right num naira">{NGN(w.amount)}</td>
                  <td>{
                    w.status === "settled" && w.live ? <span className="chip c-paid"><span className="dot" />Settled</span>
                    : w.status === "settled" ? <span className="chip c-awaiting"><span className="dot" />Demo</span>
                    : w.status === "failed" ? <span className="chip c-overpaid"><span className="dot" />Failed</span>
                    : <span className="chip c-partial"><span className="dot" />In&nbsp;flight</span>
                  }</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
