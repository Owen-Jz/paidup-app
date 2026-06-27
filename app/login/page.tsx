"use client";

import { useState } from "react";

// Shared-password login (GAPS #16). Only reachable when APP_PASSWORD is set; otherwise the app is open.
export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!r.ok) { setErr("Incorrect password."); return; }
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || "/app";
  };

  return (
    <main className="login-wrap">
      <form className="modal" onSubmit={submit}>
        <div className="kicker">PaidUp</div>
        <h3>Sign in</h3>
        <p className="sub" style={{ marginTop: -8 }}>This workspace is password-protected.</p>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} autoFocus
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        {err && <div style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
