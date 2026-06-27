"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Interactive hero widget — lets a visitor *experience* the core promise:
 * tap an incoming transfer, watch a coin travel into the invoice whose virtual
 * account it was sent to, and see that invoice flip itself to Paid / Partial.
 * "The account number IS the reference" — demonstrated, not asserted.
 *
 * Progressive: fully readable without JS (the invoices + transfers render as
 * static markup). Motion + matching layer on after mount, and honor reduced-motion.
 */

type Inv = { id: string; who: string; acct: string; amount: number };
type Tf = { id: string; amount: number; to: string; from: string };

const INVOICES: Inv[] = [
  { id: "INV-1042", who: "Dangote Cement", acct: "3049420327", amount: 450000 },
  { id: "INV-1043", who: "Jumia Nigeria", acct: "9882319033", amount: 70000 },
  { id: "INV-1046", who: "MTN Nigeria", acct: "5521190044", amount: 1300000 },
];

const TRANSFERS: Tf[] = [
  { id: "t1", amount: 450000, to: "3049420327", from: "GTBank" },
  { id: "t2", amount: 28000, to: "9882319033", from: "Opay" },
  { id: "t3", amount: 1300000, to: "5521190044", from: "Zenith" },
];

const ngn = (n: number) => "₦" + n.toLocaleString("en-NG");

export function ReconcileDemo() {
  // invoiceId -> amount paid so far
  const [paid, setPaid] = useState<Record<string, number>>({});
  const [usedTf, setUsedTf] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useRef(false);
  const gsapRef = useRef<typeof import("gsap")["gsap"] | null>(null);

  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    import("gsap").then((m) => {
      if (cancelled) return;
      gsapRef.current = m.gsap;
      // Gentle one-time hint that the first transfer is tappable.
      if (!reduce.current) {
        const first = rootRef.current?.querySelector<HTMLElement>(".demo-tf");
        if (first) m.gsap.fromTo(first, { y: 0 }, { y: -4, repeat: 3, yoyo: true, duration: 0.5, delay: 1.1, ease: "sine.inOut" });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const statusFor = (inv: Inv): { label: string; cls: string } => {
    const p = paid[inv.id] ?? 0;
    if (p === 0) return { label: "Awaiting", cls: "c-awaiting" };
    if (p >= inv.amount) return { label: p > inv.amount ? "Overpaid" : "Paid", cls: p > inv.amount ? "c-overpaid" : "c-paid" };
    return { label: "Partial", cls: "c-partial" };
  };

  const send = (tf: Tf) => {
    if (usedTf[tf.id] || busy) return;
    const inv = INVOICES.find((i) => i.acct === tf.to);
    if (!inv) return;
    const root = rootRef.current;
    const gsap = gsapRef.current;

    const settle = () => {
      setPaid((prev) => ({ ...prev, [inv.id]: (prev[inv.id] ?? 0) + tf.amount }));
      setUsedTf((prev) => ({ ...prev, [tf.id]: true }));
      setBusy(false);
    };

    if (reduce.current || !root || !gsap) { settle(); return; }

    const tfEl = root.querySelector<HTMLElement>(`[data-tf="${tf.id}"]`);
    const invEl = root.querySelector<HTMLElement>(`[data-inv="${inv.id}"]`);
    if (!tfEl || !invEl) { settle(); return; }

    const base = root.getBoundingClientRect();
    const a = tfEl.getBoundingClientRect();
    const b = invEl.getBoundingClientRect();

    // A coin token flies from the tapped transfer up into its matching invoice row.
    const coin = document.createElement("div");
    coin.className = "demo-coin";
    coin.textContent = ngn(tf.amount);
    root.appendChild(coin);
    setBusy(true);

    gsap.set(coin, { x: a.left - base.left + a.width / 2, y: a.top - base.top + a.height / 2, xPercent: -50, yPercent: -50, opacity: 0, scale: 0.7 });
    gsap
      .timeline({ onComplete: () => { coin.remove(); settle(); } })
      .to(coin, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out" })
      .to(coin, { x: b.left - base.left + b.width - 26, y: b.top - base.top + b.height / 2, duration: 0.6, ease: "power3.inOut" })
      .to(coin, { scale: 0.4, opacity: 0, duration: 0.22, ease: "power2.in" }, "-=0.04")
      .add(() => {
        invEl.classList.remove("settle");
        // reflow so the animation restarts even if matched twice
        void invEl.offsetWidth;
        invEl.classList.add("settle");
      }, "-=0.18");
  };

  const allDone = INVOICES.every((i) => (paid[i.id] ?? 0) >= i.amount);

  return (
    <div className="demo" ref={rootRef} aria-label="Interactive reconciliation demo">
      <div className="demo-head">
        <span className="demo-title serif">Your invoices</span>
        <span className="demo-live"><i />{allDone ? "all settled" : "live"}</span>
      </div>

      <div className="demo-invoices">
        {INVOICES.map((inv) => {
          const st = statusFor(inv);
          const p = paid[inv.id] ?? 0;
          return (
            <div className="demo-inv" data-inv={inv.id} key={inv.id}>
              <div className="demo-inv-l">
                <b className="mono">{inv.id}</b>
                <small>{inv.who} · <span className="mono">{inv.acct}</span></small>
              </div>
              <div className="demo-inv-r">
                <span className="naira demo-amt">{ngn(p > 0 ? Math.min(p, inv.amount) : inv.amount)}</span>
                <span className={`chip ${st.cls} demo-chip`}><span className="dot" />{st.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="demo-foot">
        <span className="demo-foot-lab">{allDone ? "Every transfer found its invoice — nothing typed by hand." : "Incoming transfers — tap one to send it"}</span>
        <div className="demo-transfers">
          {TRANSFERS.map((tf) => (
            <button
              type="button"
              key={tf.id}
              data-tf={tf.id}
              className={`demo-tf${usedTf[tf.id] ? " done" : ""}`}
              onClick={() => send(tf)}
              disabled={usedTf[tf.id] || busy}
            >
              <span className="naira">{ngn(tf.amount)}</span>
              <span className="demo-tf-to mono">→ {tf.to}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
