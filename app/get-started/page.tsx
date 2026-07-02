"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = 1 | 2 | 3 | "processing";

const TASKS = [
  "Authenticating with Nomba",
  "Provisioning virtual account",
  "Registering webhook endpoint",
  "Arming reconciliation engine",
];

export default function GetStarted() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [business, setBusiness] = useState("");
  const [connected, setConnected] = useState(false);
  const [acctId, setAcctId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [taskIdx, setTaskIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Either paste real sandbox creds, or use the demo workspace — both are valid ways forward.
  const manualReady = acctId.trim() !== "" && clientId.trim() !== "" && clientSecret.trim() !== "";

  // processing: do the REAL work first, then advance the ticker. A failure is shown honestly
  // (no green ticks over a failed provisioning) with a retry, rather than a fake success.
  useEffect(() => {
    if (step !== "processing") return;
    let cancelled = false;
    let tick: ReturnType<typeof setInterval> | undefined;
    setError(null);
    setTaskIdx(0); // first task spins while the real call is in flight

    const run = async () => {
      let ok = true;
      if (customer && parseFloat(amount) > 0) {
        try {
          const r = await fetch("/api/invoices", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customer, description: "First invoice", amount: parseFloat(amount) }),
          });
          ok = r.ok;
        } catch { ok = false; }
      }
      if (cancelled) return;
      if (!ok) {
        setError("We couldn't provision your first invoice — the server or Nomba call failed. Try again.");
        return;
      }
      let i = 0;
      tick = setInterval(() => {
        i += 1;
        if (i >= TASKS.length) {
          if (tick) clearInterval(tick);
          setTaskIdx(TASKS.length);
          setTimeout(() => { if (!cancelled) router.push("/app"); }, 900);
        } else {
          setTaskIdx(i);
        }
      }, 700);
    };
    run();
    return () => { cancelled = true; if (tick) clearInterval(tick); };
  }, [step, router, customer, amount, retry]);

  const steps = [
    { n: 1, t: "Your business", s: "Name & currency" },
    { n: 2, t: "Connect Nomba", s: "Sandbox credentials" },
    { n: 3, t: "First invoice", s: "Mint a virtual account" },
  ];
  const stepNum = step === "processing" ? 4 : step;

  return (
    <div className="ob-wrap">
      <aside className="ob-aside">
        <Link href="/" className="logo"><span className="mark">P</span><span>PaidUp</span></Link>
        <div className="ob-steps">
          {steps.map((s) => (
            <div key={s.n} className={`s ${stepNum === s.n ? "on" : ""} ${stepNum > s.n ? "done" : ""}`}>
              <div className="n">{stepNum > s.n ? "✓" : s.n}</div>
              <div><b>{s.t}</b><span>{s.s}</span></div>
            </div>
          ))}
        </div>
        <p className="quote">“Nomba ships the rails. PaidUp ships the ledger.”</p>
      </aside>

      <main className="ob-main">
        {step === 1 && (
          <div className="ob-card">
            <span className="kicker">Step 1 of 3</span>
            <h2>Let’s set up your business.</h2>
            <p className="sub">This is the name your customers see on their payment account.</p>
            <label>Business name</label>
            <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Cresiolabs Ltd" autoFocus />
            <label>Currency</label>
            <input value="NGN — Nigerian Naira" disabled />
            <div className="ob-actions">
              <Link href="/" className="ghost">← Back</Link>
              <button className="btn-xl" onClick={() => setStep(2)} disabled={!business.trim()} style={{ opacity: business.trim() ? 1 : 0.5 }}>Continue →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ob-card">
            <span className="kicker">Step 2 of 3</span>
            <h2>Connect your Nomba account.</h2>
            <p className="sub">Paste your sandbox API credentials, or use the Cresiolabs demo workspace to skip ahead.</p>
            <label htmlFor="ob-acct">Account ID</label>
            <input id="ob-acct" value={connected ? "Cresiolabs sandbox (demo workspace)" : acctId} onChange={(e) => setAcctId(e.target.value)} readOnly={connected} placeholder="parent account id" />
            <div className="field-row">
              <div><label htmlFor="ob-cid">Client ID</label><input id="ob-cid" value={connected ? "demo · pre-connected" : clientId} onChange={(e) => setClientId(e.target.value)} readOnly={connected} placeholder="client id" /></div>
              <div><label htmlFor="ob-sec">Client secret</label><input id="ob-sec" type="password" value={connected ? "demo" : clientSecret} onChange={(e) => setClientSecret(e.target.value)} readOnly={connected} placeholder="private key" /></div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <button type="button" className="demo-pill" onClick={() => setConnected(true)}>⚡ Use demo sandbox (Cresiolabs)</button>
              {connected && <div style={{ color: "var(--faint)", fontSize: 11.5, marginTop: 8 }}>Sandbox preview — uses the server&apos;s configured test keys; nothing you type here is stored.</div>}
            </div>
            <div className="ob-actions">
              <button className="ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-xl" onClick={() => setStep(3)} disabled={!connected && !manualReady} style={{ opacity: connected || manualReady ? 1 : 0.5 }}>
                {connected ? "Connected — continue →" : manualReady ? "Continue →" : "Connect to continue"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ob-card">
            <span className="kicker">Step 3 of 3</span>
            <h2>Raise your first invoice.</h2>
            <p className="sub">We’ll mint a dedicated virtual account for it — payment to that account auto-reconciles.</p>
            <label>Customer</label>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Dangote Cement Plc" autoFocus />
            <label>Amount (₦)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="450000" />
            <div className="ob-actions">
              <button className="ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-xl" onClick={() => setStep("processing")} disabled={!customer.trim() || !(parseFloat(amount) > 0)} style={{ opacity: customer.trim() && parseFloat(amount) > 0 ? 1 : 0.5 }}>
                Arm reconciliation →
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="proc">
            <span className="kicker">Setting up</span>
            <h2>{error ? "Setup hit a snag." : "Arming your reconciliation engine…"}</h2>
            {error ? (
              <>
                <p className="sub" style={{ color: "var(--reversed-ink, #b4442f)", marginBottom: 22 }}>{error}</p>
                <div className="ob-actions">
                  <button className="ghost" onClick={() => { setError(null); setStep(3); }}>← Back</button>
                  <button className="btn-xl" onClick={() => { setError(null); setRetry((r) => r + 1); }}>Retry →</button>
                </div>
              </>
            ) : (
              <>
                {TASKS.map((t, i) => (
                  <div key={t} className={`task ${taskIdx === i ? "active" : ""} ${taskIdx > i ? "done" : ""}`}>
                    <div className="ic">
                      {taskIdx > i ? <div className="tick">✓</div> : taskIdx === i ? <div className="spin" /> : <div className="spin" style={{ borderTopColor: "var(--line-2)" }} />}
                    </div>
                    <span>{t}{taskIdx === i ? "…" : ""}</span>
                  </div>
                ))}
                {taskIdx >= TASKS.length && (
                  <p className="sub" style={{ marginTop: 22 }}>Engine armed. Taking you to your dashboard…</p>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
