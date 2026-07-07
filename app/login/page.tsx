"use client";

import { useState } from "react";
import Link from "next/link";

// Email + password sign-in (multi-tenant auth). New businesses create a workspace at /signup;
// judges/reviewers can use the demo workspace credentials documented in DEMO.md.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const login = async (em: string, pw: string) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em, password: pw }),
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

  const submit = (e: React.FormEvent) => { e.preventDefault(); login(email, password); };

  const demo = () => {
    setEmail("demo@paidup.app"); setPassword("LedgerDemo2026");
    login("demo@paidup.app", "LedgerDemo2026");
  };

  return (
    <main className="login-wrap">
      <form className="modal" onSubmit={submit}>
        <div className="kicker">PaidUp</div>
        <h3>Sign in</h3>
        <p className="sub" style={{ marginTop: -8 }}>Your workspace, your ledger.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} autoFocus autoComplete="email" required
          onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        <label htmlFor="pw">Password</label>
        <div style={{ position: "relative" }}>
          <input id="pw" type={showPw ? "text" : "password"} value={password} autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none",
              cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)", color: "var(--faint)", padding: 4 }}>
            {showPw ? "HIDE" : "SHOW"}
          </button>
        </div>
        {err && <div style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="sub" style={{ marginTop: 14, marginBottom: 0, fontSize: 12 }}>
          New here? <Link href="/signup" style={{ textDecoration: "underline" }}>Create your workspace</Link>
        </p>
        <p className="sub" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
          Exploring or reviewing?{" "}
          <button type="button" onClick={demo} disabled={busy}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textDecoration: "underline" }}>
            Use the demo workspace →
          </button>
        </p>
      </form>
    </main>
  );
}
