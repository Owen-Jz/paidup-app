"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = 1 | 2 | "processing";

type CreatedInvoice = { id: string; acctNumber: string; acctName: string; bankName: string; payToken?: string };

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
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [taskIdx, setTaskIdx] = useState(-1);
  const [invoice, setInvoice] = useState<CreatedInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // NOTE: no "connect your Nomba account" step — the Nomba integration is platform-level (the
  // server's credentials), never something a merchant pastes in. Signup already made the workspace.

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
          if (r.ok) {
            const j = await r.json();
            if (!cancelled && j?.invoice) setInvoice(j.invoice);
          }
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
          setTaskIdx(TASKS.length); // done — show the created-invoice confirmation, no auto-redirect
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
    { n: 2, t: "First invoice", s: "Mint a virtual account" },
  ];
  const stepNum = step === "processing" ? 3 : step;

  return (
    <div className="ob-wrap">
      <aside className="ob-aside">
        <Link href="/" className="logo"><img src="/logo.svg" alt="" width={30} height={30} style={{ borderRadius: 7 }} /><span>PaidUp</span></Link>
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
            <span className="kicker">Step 1 of 2</span>
            <h2>Let’s set up your business.</h2>
            <p className="sub">This is the name your customers see on their payment account.</p>
            <label>Business name</label>
            <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Cresiolabs Ltd" autoFocus />
            <label>Currency</label>
            <input value="NGN — Nigerian Naira" disabled />
            <div className="ob-actions">
              <Link href="/" className="ghost">← Back</Link>
              <button className="btn-xl" onClick={() => setStep(2)} disabled={!business.trim()}>Continue →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ob-card">
            <span className="kicker">Step 2 of 2</span>
            <h2>Raise your first invoice.</h2>
            <p className="sub">We’ll mint a dedicated virtual account for it — payment to that account auto-reconciles.</p>
            <label>Customer</label>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Dangote Cement Plc" autoFocus />
            <label>Amount (₦)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="450000" />
            <div className="ob-actions">
              <button className="ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-xl" onClick={() => setStep("processing")} disabled={!customer.trim() || !(parseFloat(amount) > 0)}>
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
                <p className="sub" style={{ color: "var(--attn)", marginBottom: 22 }}>{error}</p>
                <div className="ob-actions">
                  <button className="ghost" onClick={() => { setError(null); setStep(2); }}>← Back</button>
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
                  <div style={{ marginTop: 22 }}>
                    {invoice ? (
                      <>
                        <h3 style={{ margin: "0 0 6px" }}>✓ {invoice.id} created for {customer}.</h3>
                        <p className="sub" style={{ marginBottom: 14 }}>
                          Its dedicated account is live — any transfer to it reconciles automatically.
                        </p>
                        <div className="created-acct" style={{ marginBottom: 18 }}>
                          <div className="mono" style={{ fontSize: 26, letterSpacing: ".04em" }}>{invoice.acctNumber}</div>
                          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{invoice.bankName} · {invoice.acctName}</div>
                        </div>
                        <div className="ob-actions" style={{ flexWrap: "wrap", gap: 10 }}>
                          {invoice.payToken && (
                            <a className="ghost" href={`/pay/${invoice.payToken}/invoice`} target="_blank" rel="noopener noreferrer">
                              ⤓ Download invoice (PDF)
                            </a>
                          )}
                          <button className="btn-xl" onClick={() => router.push("/app")}>Go to your dashboard →</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="sub" style={{ marginBottom: 14 }}>Engine armed. Your workspace is ready.</p>
                        <div className="ob-actions">
                          <button className="btn-xl" onClick={() => router.push("/app")}>Go to your dashboard →</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
