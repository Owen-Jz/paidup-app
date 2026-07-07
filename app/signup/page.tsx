"use client";

import { useState } from "react";
import Link from "next/link";

// Self-serve signup: business name + email + password → an isolated, empty workspace, then straight
// into the get-started wizard to mint the first invoice.
export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, email, password }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setErr(j?.error || "Could not create your workspace.");
      return;
    }
    window.location.href = "/get-started";
  };

  return (
    <main className="login-wrap">
      <form className="modal" onSubmit={submit}>
        <div className="kicker">PaidUp</div>
        <h3>Create your workspace</h3>
        <p className="sub" style={{ marginTop: -8 }}>Every invoice gets its own account. Every payment reconciles itself.</p>
        <label htmlFor="biz">Business name</label>
        <input id="biz" value={businessName} autoFocus autoComplete="organization" required
          onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Cresiolabs Ltd" />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} autoComplete="email" required
          onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        <label htmlFor="pw">Password</label>
        <div style={{ position: "relative" }}>
          <input id="pw" type={showPw ? "text" : "password"} value={password} autoComplete="new-password"
            required minLength={8}
            onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" />
          <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none",
              cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)", color: "var(--faint)", padding: 4 }}>
            {showPw ? "HIDE" : "SHOW"}
          </button>
        </div>
        {err && <div style={{ color: "var(--attn)", fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
        <p className="sub" style={{ marginTop: 14, marginBottom: 0, fontSize: 12 }}>
          Already have one? <Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link>
        </p>
      </form>
    </main>
  );
}
