"use client";

import { useState } from "react";
import Link from "next/link";

// Email + password sign-in (multi-tenant auth). New businesses create a workspace at /signup;
// judges/reviewers can use the demo workspace credentials documented in DEMO.md.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setErr(j?.error || "Invalid email or password.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || "/app";
  };

  return (
    <main className="login-wrap">
      <form className="modal" onSubmit={submit}>
        <div className="kicker">PaidUp</div>
        <h3>Sign in</h3>
        <p className="sub" style={{ marginTop: -8 }}>Your workspace, your ledger.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} autoFocus autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        {err && <div style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="sub" style={{ marginTop: 14, marginBottom: 0, fontSize: 12 }}>
          New here? <Link href="/signup" style={{ textDecoration: "underline" }}>Create your workspace</Link>
        </p>
      </form>
    </main>
  );
}
