"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Dependency-free guided tour (coach-marks). Spotlights real elements by CSS selector and floats a
// tooltip beside them; falls back to a centered card when a step has no target or the target isn't
// visible (e.g. the sidebar nav collapsed on mobile). Auto-starts ONCE per browser for every user
// (localStorage), is fully dismissable, and can be replayed by dispatching `window` event
// "paidup:tour". Engaging, never forceful — Skip is always one click away.

export interface TourStep {
  selector?: string; // element to spotlight; omit → centered step
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8;

export function GuidedTour({ steps, storageKey = "paidup_tour_v1" }: { steps: TourStep[]; storageKey?: string }) {
  const [running, setRunning] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Auto-start once per browser, after the page settles so targets have laid out.
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "1"; } catch { /* private mode */ }
    if (seen) return;
    const t = setTimeout(() => setRunning(true), 900);
    return () => clearTimeout(t);
  }, [storageKey]);

  // Replay: any button can fire window event "paidup:tour".
  useEffect(() => {
    const start = () => { setI(0); setRunning(true); };
    window.addEventListener("paidup:tour", start);
    return () => window.removeEventListener("paidup:tour", start);
  }, []);

  const step = steps[i];

  const measure = useCallback(() => {
    const sel = step?.selector;
    if (!sel) { setRect(null); return; }
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el || el.offsetParent === null) { setRect(null); return; } // hidden → centered fallback
    const vh = window.innerHeight;
    let r = el.getBoundingClientRect();
    // Bring the target into a comfortable position ONLY if it's off-screen. Scroll INSTANTLY (not
    // smooth) so the very next getBoundingClientRect is already accurate — a smooth scroll measured
    // too early is exactly what threw the tall feed step off-screen. A target taller than the viewport
    // is pinned near the top (76px) instead of "centered" (which would push its top above the fold).
    if (r.top < 76 || r.bottom > vh - 76) {
      const targetTop = r.height > vh * 0.7 ? 76 : Math.max(76, (vh - r.height) / 2);
      window.scrollBy({ top: r.top - targetTop, left: 0, behavior: "auto" });
      r = el.getBoundingClientRect();
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!running) return;
    measure();
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    const t = setTimeout(measure, 250); // catch any late layout settle (fonts/images/poll)
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); clearTimeout(t); };
  }, [running, i, measure]);

  const finish = useCallback(() => {
    setRunning(false);
    try { localStorage.setItem(storageKey, "1"); } catch { /* private mode */ }
  }, [storageKey]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, finish, steps.length]);

  if (!running || !step) return null;

  const isLast = i === steps.length - 1;
  const next = () => (isLast ? finish() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(n - 1, 0));

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;

  let tip: React.CSSProperties;
  if (rect) {
    // Height budget for the card; used only to keep it fully on-screen. Prefer below the target,
    // else above, else vertically centered — then hard-clamp so the card can NEVER leave the viewport
    // (the bug when the target was taller than the screen or scrolled partly off).
    const TH = 200;
    const roomBelow = vh - (rect.top + rect.height);
    let top: number;
    if (roomBelow > TH + 20) top = rect.top + rect.height + 14;
    else if (rect.top > TH + 20) top = rect.top - 14 - TH;
    else top = (vh - TH) / 2;
    top = Math.max(16, Math.min(top, vh - TH - 16));
    tip = {
      position: "fixed",
      top,
      left: Math.min(Math.max(rect.left, 16), Math.max(16, vw - 336)),
      width: "min(320px, calc(100vw - 32px))",
    };
  } else {
    tip = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(360px, calc(100vw - 32px))" };
  }

  return (
    // Full-screen blocker: catches stray clicks so the tour can't be lost by accident (Skip is explicit).
    <div style={{ position: "fixed", inset: 0, zIndex: 1000 }} aria-live="polite">
      {rect ? (
        <div style={{
          position: "fixed",
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 12, boxShadow: "0 0 0 9999px rgba(8,20,14,.66)",
          outline: "2px solid var(--gold-bright, #E7B24A)", outlineOffset: 2,
          pointerEvents: "none", transition: "top .25s, left .25s, width .25s, height .25s",
        }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,20,14,.66)" }} />
      )}

      <div style={{ ...tip, background: "var(--paper, #FAF6ED)", color: "var(--ink, #0E5638)", borderRadius: 14, padding: "16px 16px 14px", boxShadow: "0 24px 60px rgba(0,0,0,.4)", zIndex: 1001 }} role="dialog" aria-modal="true" aria-label={step.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <img src="/logo.svg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          <b style={{ fontFamily: "var(--serif)", fontSize: 16 }}>{step.title}</b>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2, #35513f)" }}>{step.body}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 5, marginRight: "auto" }}>
            {steps.map((_, n) => (
              <span key={n} style={{ width: 6, height: 6, borderRadius: 999, background: n === i ? "var(--accent, #38C98A)" : "rgba(14,86,56,.22)" }} />
            ))}
          </div>
          <button onClick={finish} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "var(--faint, #7C877E)" }}>Skip</button>
          {i > 0 && <button onClick={back} style={{ background: "none", border: "1px solid var(--line-2, #d8ddd6)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "inherit" }}>Back</button>}
          <button onClick={next} style={{ background: "var(--ink, #0E5638)", color: "var(--paper, #FAF6ED)", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{isLast ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
