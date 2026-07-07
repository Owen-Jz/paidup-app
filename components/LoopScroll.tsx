"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// See LandingMotion: pin cleanup must run BEFORE React removes DOM on route change,
// which only a layout effect guarantees. SSR falls back to useEffect.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { Landmark, ArrowRightLeft, Webhook, CheckCircle2 } from "lucide-react";

/**
 * "How money finds its invoice" — a horizontal, scroll-snapping walk through the four steps of the
 * reconciliation loop. On desktop the section pins and vertical scroll drives the track sideways,
 * snapping panel-to-panel (GSAP ScrollTrigger). On touch / small / reduced-motion it degrades to a
 * native horizontal scroll-snap carousel you can just swipe — fully readable with zero JS.
 */
export function LoopScroll() {
  const root = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    let mm: ReturnType<typeof import("gsap")["gsap"]["matchMedia"]> | null = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      if (cancelled || !root.current) return;

      mm = gsap.matchMedia();
      mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(root.current);
        const stage = q(".lx-stage")[0] as HTMLElement;
        const track = q(".lx-track")[0] as HTMLElement;
        const panels = q(".lx-panel");
        if (!stage || !track || panels.length < 2) return;

        root.current!.classList.add("is-pinned");
        const distance = () => Math.max(0, track.scrollWidth - stage.clientWidth);

        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current!,
            start: "top top",
            end: () => "+=" + distance(),
            pin: true,
            scrub: 1,
            snap: { snapTo: 1 / (panels.length - 1), duration: 0.35, ease: "power1.inOut" },
            // Lower than StoryScroll's pin (which sits earlier on the page) so refresh order is
            // deterministic and both pins compute their spacing correctly.
            refreshPriority: 1,
            invalidateOnRefresh: true,
          },
        });

        // Each panel's illustration lifts in as it becomes the active (centered) one.
        panels.forEach((p) => {
          gsap.fromTo(
            (p as HTMLElement).querySelector(".lx-illo"),
            { autoAlpha: 0.35, y: 26 },
            {
              autoAlpha: 1, y: 0, ease: "power2.out",
              scrollTrigger: {
                trigger: p as HTMLElement,
                containerAnimation: tween,
                start: "left center",
                end: "center center",
                scrub: true,
              },
            }
          );
        });

        return () => root.current?.classList.remove("is-pinned");
      });
    })();

    return () => { cancelled = true; mm?.revert(); };
  }, []);

  return (
    <section className="loopx" id="how" ref={root} aria-label="How money finds its invoice">
      <div className="lx-head">
        <span className="kicker">The loop</span>
        <h2 className="section-title">How money finds its invoice.</h2>
        <p className="section-lead">Four steps, zero human matching — it runs the second funds arrive. <span className="lx-hint">Scroll →</span></p>
      </div>

      <div className="lx-stage">
        <div className="lx-track">
          {/* 01 — Provision */}
          <article className="lx-panel">
            <div className="lx-illo">
              <div className="lx-doc">
                <span className="lx-doc-h mono">INVOICE · INV-1042</span>
                <span className="lx-doc-line w80" /><span className="lx-doc-line w55" />
                <span className="lx-doc-amt mono naira">₦450,000</span>
              </div>
              <span className="lx-mint mono">mints ↓</span>
              <div className="lx-chip">
                <span className="lx-chip-lab mono">VIRTUAL ACCOUNT</span>
                <b className="mono">3049 420 327</b>
              </div>
            </div>
            <div className="lx-txt">
              <span className="lx-no mono">01</span>
              <div className="lx-ic"><Landmark size={18} /></div>
              <h3>Provision</h3>
              <p>Create an invoice — PaidUp mints a dedicated Nomba virtual account that belongs to that invoice alone.</p>
            </div>
          </article>

          {/* 02 — Customer pays */}
          <article className="lx-panel">
            <div className="lx-illo">
              <div className="lx-bank">
                <span className="lx-bank-dot" /><span>Any Nigerian bank app</span>
              </div>
              <div className="lx-wire"><span className="lx-coin mono">₦</span></div>
              <div className="lx-chip small"><b className="mono">3049 420 327</b></div>
            </div>
            <div className="lx-txt">
              <span className="lx-no mono">02</span>
              <div className="lx-ic"><ArrowRightLeft size={18} /></div>
              <h3>Customer pays</h3>
              <p>They transfer to that account number from any bank — no portal, no login, no reference to type.</p>
            </div>
          </article>

          {/* 03 — Webhook */}
          <article className="lx-panel">
            <div className="lx-illo">
              <div className="lx-hook">
                <span className="lx-ping" aria-hidden="true"><i /><i /><i /></span>
                <span className="lx-hook-ev mono">payment_success</span>
                <span className="lx-hook-lock mono"><Webhook size={13} /> 9-field HMAC · verified</span>
              </div>
            </div>
            <div className="lx-txt">
              <span className="lx-no mono">03</span>
              <div className="lx-ic"><Webhook size={18} /></div>
              <h3>Signed webhook</h3>
              <p>Nomba fires a cryptographically-signed <span className="mono">payment_success</span> the instant funds land. PaidUp verifies every field.</p>
            </div>
          </article>

          {/* 04 — Reconciled */}
          <article className="lx-panel">
            <div className="lx-illo">
              <div className="lx-recon">
                <span className="lx-recon-top mono">INV-1042 · <span className="naira">₦450,000</span></span>
                <div className="lx-recon-bar"><i /></div>
                <span className="lx-stamp mono">PAID</span>
              </div>
            </div>
            <div className="lx-txt">
              <span className="lx-no mono">04</span>
              <div className="lx-ic"><CheckCircle2 size={18} /></div>
              <h3>Reconciled</h3>
              <p>Matched by its account reference, classified paid / partial / overpaid, and written to the live ledger — automatically.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
