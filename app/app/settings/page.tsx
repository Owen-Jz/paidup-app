"use client";

import { useEffect, useState } from "react";

// Account & workspace management: rename the business, change the password, and the danger zone —
// clear the ledger or delete the account outright. Every destructive action is confirmed twice:
// a typed confirmation in the UI AND re-verified server-side (email match / password) so nothing
// here is one accidental click away.

interface AccountInfo {
  email: string;
  businessName: string;
  createdAt: string;
  demo: boolean;
  counts: { invoices: number; events: number; withdrawals: number; pendingPayouts: number };
}

export default function SettingsPage() {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passBusy, setPassBusy] = useState(false);

  const [clearConfirm, setClearConfirm] = useState("");
  const [clearMsg, setClearMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const [delPass, setDelPass] = useState("");
  const [delMsg, setDelMsg] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/account", { cache: "no-store" });
      if (!r.ok) { setLoadErr(true); return; }
      const j = (await r.json()) as AccountInfo;
      setInfo(j);
      setName(j.businessName);
    } catch { setLoadErr(true); }
  };
  useEffect(() => { load(); }, []);

  const post = async (body: object) => {
    const r = await fetch("/api/account", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, j };
  };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameBusy(true); setNameMsg(null);
    const { ok, j } = await post({ action: "rename", businessName: name });
    setNameBusy(false);
    setNameMsg(ok ? { ok: true, text: "Saved — new invoices will carry this name." } : { ok: false, text: j?.error || "Couldn't save." });
    if (ok) load();
  };

  const changePass = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassBusy(true); setPassMsg(null);
    const { ok, j } = await post({ action: "password", currentPassword: curPass, newPassword: newPass });
    setPassBusy(false);
    if (ok) {
      setPassMsg({ ok: true, text: "Password changed. Every other signed-in session has been logged out; this one stays." });
      setCurPass(""); setNewPass("");
    } else {
      setPassMsg({ ok: false, text: j?.error || "Couldn't change the password." });
    }
  };

  const clearData = async () => {
    setClearBusy(true); setClearMsg(null);
    const { ok, j } = await post({ action: "clear-data", confirm: clearConfirm });
    setClearBusy(false);
    if (ok) {
      setClearMsg({ ok: true, text: `Workspace cleared — removed ${j.removed.invoices} invoices, ${j.removed.events} feed events, ${j.removed.withdrawals} payouts. The audit trail is kept.` });
      setClearConfirm("");
      load();
    } else {
      setClearMsg({ ok: false, text: j?.error || "Couldn't clear the workspace." });
    }
  };

  const deleteAcct = async () => {
    setDelBusy(true); setDelMsg(null);
    try {
      const r = await fetch("/api/account", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: delPass }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setDelMsg(j?.error || "Couldn't delete the account."); setDelBusy(false); return; }
      window.location.href = "/"; // session cookie already cleared by the server
    } catch {
      setDelMsg("Connection dropped — refresh and check whether the account is gone before retrying.");
      setDelBusy(false);
    }
  };

  const msg = (m: { ok: boolean; text: string } | null) =>
    m && <div role={m.ok ? "status" : "alert"} style={{ color: m.ok ? "var(--ink-2)" : "var(--attn)", fontSize: 12, marginTop: 8 }}>{m.ok ? "✓ " : "⚠ "}{m.text}</div>;

  return (
    <main>
      <div>
        <h1 className="h1">Settings</h1>
        <p className="sub">Your account and workspace — rename the business, rotate your password, or clear things out and start fresh.</p>
      </div>

      {loadErr && <div className="banner err" role="alert">⚠ Couldn&apos;t load your account — refresh to retry.</div>}

      {/* Workspace */}
      <div className="modal" style={{ width: "min(560px, 100%)", marginTop: 20 }}>
        <form onSubmit={rename}>
          <h3>Workspace</h3>
          <label htmlFor="set-email">Account email</label>
          <input id="set-email" value={info?.email ?? "…"} disabled readOnly />
          <label htmlFor="set-name">Business name — what payers see</label>
          <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Cresiolabs" />
          {msg(nameMsg)}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <button className="btn" type="submit" disabled={nameBusy || !info || name.trim().length < 2 || name.trim() === info.businessName}>
              {nameBusy ? "Saving…" : "Save name"}
            </button>
            {info && <small style={{ color: "var(--muted)", fontSize: 12 }}>
              {info.counts.invoices} invoices · {info.counts.events} events · {info.counts.withdrawals} payouts
            </small>}
          </div>
        </form>
      </div>

      {/* Security */}
      <div className="modal" style={{ width: "min(560px, 100%)", marginTop: 20 }}>
        <form onSubmit={changePass}>
          <h3>Security</h3>
          <label htmlFor="set-cur">Current password</label>
          <input id="set-cur" type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} autoComplete="current-password" />
          <label htmlFor="set-new">New password — at least 8 characters</label>
          <input id="set-new" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
          {msg(passMsg)}
          <div className="row" style={{ justifyContent: "flex-start", marginTop: 12 }}>
            <button className="btn" type="submit" disabled={passBusy || !curPass || newPass.length < 8}>
              {passBusy ? "Changing…" : "Change password"}
            </button>
          </div>
          <p className="sub" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Changing your password signs out every other device immediately — this session stays.
          </p>
        </form>
      </div>

      {/* Danger zone */}
      <div className="modal" style={{ width: "min(560px, 100%)", marginTop: 20, border: "1px solid var(--attn)" }}>
        <h3 style={{ color: "var(--attn)" }}>Danger zone</h3>
        {info?.demo && (
          <p className="sub" style={{ fontSize: 12 }}>
            This is the shared demo workspace — it can&apos;t be cleared or deleted.
          </p>
        )}
        {info && info.counts.pendingPayouts > 0 && (
          <p className="sub" style={{ fontSize: 12 }}>
            ⏳ {info.counts.pendingPayouts} payout{info.counts.pendingPayouts > 1 ? "s are" : " is"} still in flight — these
            actions are blocked until every payout settles or fails, so money mid-air is never orphaned.
          </p>
        )}

        <label htmlFor="set-clear">Clear workspace data — erases invoices, the live feed and payout history, keeps your login. Type your account email to confirm.</label>
        <input id="set-clear" value={clearConfirm} onChange={(e) => setClearConfirm(e.target.value)} placeholder={info?.email ?? "your account email"} autoComplete="off" disabled={info?.demo} />
        {msg(clearMsg)}
        <div className="row" style={{ justifyContent: "flex-start", marginTop: 10, marginBottom: 22 }}>
          <button className="btn" type="button" onClick={clearData}
            style={{ background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--line-2)" }}
            disabled={clearBusy || !info || info.demo || clearConfirm.trim().toLowerCase() !== info.email}>
            {clearBusy ? "Clearing…" : "Clear workspace data"}
          </button>
        </div>

        <label htmlFor="set-del">Delete account — erases everything above plus your login and this workspace. Irreversible. Enter your password to confirm.</label>
        <input id="set-del" type="password" value={delPass} onChange={(e) => setDelPass(e.target.value)} autoComplete="current-password" disabled={info?.demo} />
        {delMsg && <div role="alert" style={{ color: "var(--attn)", fontSize: 12, marginTop: 8 }}>⚠ {delMsg}</div>}
        <div className="row" style={{ justifyContent: "flex-start", marginTop: 10 }}>
          <button className="btn" type="button" onClick={deleteAcct} disabled={delBusy || !info || info.demo || !delPass}
            style={{ background: "var(--attn)", borderColor: "var(--attn)" }}>
            {delBusy ? "Deleting…" : "Delete account"}
          </button>
        </div>
        <p className="sub" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          The tamper-evident audit trail is append-only and survives both actions — history is never rewritten.
        </p>
      </div>
    </main>
  );
}
