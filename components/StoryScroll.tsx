"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// See LandingMotion: pin cleanup must run BEFORE React removes DOM on route change,
// which only a layout effect guarantees. SSR falls back to useEffect.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The problem→solution story, told as one pinned scroll scene (desktop) or two
 * plain stacked sections (mobile / reduced motion / no-JS — the markup below is
 * fully readable with zero JS, same philosophy as LandingMotion).
 *
 * Act 1 — the evening ritual: copy on the left, an iPhone on the right with bank
 * credit alerts endlessly scrolling (pure CSS loop).
 * Act 2 — scroll zooms INTO the phone screen, the screen goes ink-dark and takes
 * over the viewport, and the solution ("PaidUp ends that.") plays out in three
 * illustrated beats, all scrubbed to the scroll position.
 */

// Vague, look-alike credit alerts — the nightly guessing game, rendered twice for a seamless loop.
const ALERTS = [
  { bank: "G", bankBg: "#B3541E", title: "Credit Alert", amt: "₦450,000.00", narr: "NIP/JOHN G/—" },
  { bank: "A", bankBg: "#1F6E43", title: "Credit Alert", amt: "₦20,000.00", narr: "TRF/payment" },
  { bank: "O", bankBg: "#0E7B5B", title: "You've received money", amt: "₦75,500.00", narr: "Pymt for inv 1050" },
  { bank: "Z", bankBg: "#8A2B2B", title: "Credit Alert", amt: "₦120,000.00", narr: "NIP/URGENT/—" },
  { bank: "U", bankBg: "#8A1F1F", title: "Credit Alert", amt: "₦450,000.00", narr: "transfer" },
  { bank: "K", bankBg: "#5B3B8A", title: "Money in!", amt: "₦15,000.00", narr: "thanks 🙏" },
  { bank: "F", bankBg: "#1F4E8A", title: "Credit Alert", amt: "₦89,000.00", narr: "NIP/CHIDINMA O/goods" },
  { bank: "S", bankBg: "#2B6E8A", title: "Credit Alert", amt: "₦230,000.00", narr: "inv payment pt2" },
];

function AlertList() {
  return (
    <>
      {ALERTS.map((a, i) => (
        <div className="ph-alert" key={i}>
          <span className="ph-bank" style={{ background: a.bankBg }}>{a.bank}</span>
          <span className="ph-alert-body">
            <b>{a.title}</b>
            <span className="mono">{a.narr}</span>
          </span>
          <b className="ph-amt mono">{a.amt}</b>
        </div>
      ))}
    </>
  );
}

export function StoryScroll() {
  const root = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    let mm: { revert: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      if (cancelled || !root.current) return;

      // Pinned cinematic only where it can shine: pointer-precision viewports, motion allowed.
      mm = gsap.matchMedia();
      (mm as ReturnType<typeof gsap.matchMedia>).add(
        "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
        () => {
          const q = gsap.utils.selector(root.current);
          const pin = q(".story-pin")[0] as HTMLElement;
          const stage = q(".story-stage")[0] as HTMLElement;
          const screen = q(".ph-screen")[0] as HTMLElement;
          const dark = q(".story-dark")[0] as HTMLElement;
          if (!pin || !stage || !screen || !dark) return;

          root.current!.classList.add("is-cine");

          // Zoom must converge on the CENTER OF THE PHONE SCREEN, wherever layout put it.
          const setOrigin = () => {
            const r = screen.getBoundingClientRect();
            const s = stage.getBoundingClientRect();
            gsap.set(stage, {
              transformOrigin: `${r.left + r.width / 2 - s.left}px ${r.top + r.height / 2 - s.top}px`,
            });
          };
          setOrigin();

          // The dark act becomes a same-size overlay inside the pin (static flow otherwise).
          gsap.set(dark, { position: "absolute", inset: 0, autoAlpha: 0, zIndex: 3 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: pin,
              start: "top top",
              end: "+=340%",           // more runway = less change per scrolled pixel = smoother
              pin: true,
              anticipatePin: 1,        // pre-position the pin so entry doesn't visibly jump
              scrub: 1.2,              // heavier smoothing between scroll and playhead
              // Higher than the later LoopScroll pin so this earlier section always computes its
              // pin-spacing FIRST — otherwise the two pins race on refresh and this zoom stops engaging.
              refreshPriority: 2,
              invalidateOnRefresh: true,
              onRefresh: setOrigin,
            },
          });

          // — Act 1 → 2: one continuous crossfade — every segment overlaps its neighbours,
          //   nothing snaps. The screen is fully ink BEFORE the zoom gets big (so the scaled
          //   alert cards never shimmer), and the stage fades out UNDER the dark act, never pops.
          tl.to(q(".ph-screen-ink"), { autoAlpha: 1, duration: 1.2, ease: "sine.inOut" }, 0.5)
            .to(q(".story-copy"), { autoAlpha: 0, x: -30, duration: 1.1, ease: "sine.in" }, 0.35)
            .to(stage, { scale: 3.4, duration: 2.8, ease: "power1.inOut", force3D: true }, 0.5)
            .to(dark, { autoAlpha: 1, duration: 1.3, ease: "sine.inOut" }, 1.9)
            .to(stage, { autoAlpha: 0, duration: 0.7, ease: "sine.out" }, 2.6)

            // — Act 2: the whole panel drifts up gently while the beats overlap-cascade in —
            .fromTo(q(".story-dark-in"), { y: 48 }, { y: 0, duration: 4.6, ease: "sine.out" }, 3.0)
            .fromTo(q(".sol-head"), { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: "power2.out" }, 3.1)
            .fromTo(q(".sol-step-1"), { autoAlpha: 0, y: 44 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: "power2.out" }, 3.9)
            .fromTo(q(".sol-step-1 .dg"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.5, ease: "sine.out" }, 4.4)
            .fromTo(q(".sol-step-2"), { autoAlpha: 0, y: 44 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: "power2.out" }, 4.8)
            .fromTo(q(".sol-wire"), { scaleX: 0 }, { scaleX: 1, duration: 1.0, ease: "sine.inOut", transformOrigin: "left center" }, 5.3)
            .fromTo(q(".sol-step-3"), { autoAlpha: 0, y: 44 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: "power2.out" }, 5.7)
            .fromTo(q(".sol-stamp"), { autoAlpha: 0, scale: 1.7, rotate: -12 }, { autoAlpha: 1, scale: 1, rotate: -6, duration: 0.9, ease: "back.out(1.4)" }, 6.4)
            .fromTo(q(".sol-close"), { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: "power2.out" }, 7.2)
            .to({}, { duration: 1.4 }, 8.3); // hold the finished frame before unpinning

          return () => root.current?.classList.remove("is-cine");
        }
      );
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  return (
    <section className="story" ref={root} aria-label="The problem PaidUp solves">
      <div className="story-pin">
        {/* ---------- Act 1: the evening ritual ---------- */}
        <div className="story-stage">
          <div className="story-copy">
            <span className="kicker" style={{ color: "var(--attn)" }}>9:41 PM · every night</span>
            <h2>You know the evening ritual.</h2>
            <p>Scrolling bank alerts, trying to figure out <em>who paid for what</em>.</p>
            <p>
              Someone sends <b className="mono">₦450,000</b> with no description — is that
              Dangote&apos;s invoice, or Konga&apos;s?
            </p>
            <p>So you open the spreadsheet. Again. And match it by hand. Every single day.</p>
            <span className="story-hint mono">keep scrolling ↓</span>
          </div>

          <div className="story-phone">
            <div className="iphone" role="img" aria-label="A phone full of vague bank credit alerts">
              <span className="ip-btn ip-power" aria-hidden="true" />
              <span className="ip-btn ip-vol1" aria-hidden="true" />
              <span className="ip-btn ip-vol2" aria-hidden="true" />
              <div className="ph-screen">
                <div className="ph-statusbar mono" aria-hidden="true"><span>9:41</span><span>▁▂▄ 󠀠 5G 󠀠 ▮</span></div>
                <div className="ph-day mono" aria-hidden="true">Tonight</div>
                <div className="ph-alerts" aria-hidden="true">
                  <div className="ph-alerts-track">
                    <AlertList />
                    <AlertList />
                  </div>
                </div>
                <div className="ph-screen-ink" aria-hidden="true" />
              </div>
              <div className="ip-island" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* ---------- Act 2: the solution, on ink ---------- */}
        <div className="story-dark">
          <div className="story-dark-in">
            <h2 className="sol-head">PaidUp ends that.</h2>

            <div className="sol-steps">
              <div className="sol-step sol-step-1">
                <span className="sol-no mono">01</span>
                <div className="sol-card">
                  <span className="sol-kicker mono">INV-1042 · Dangote Cement</span>
                  <span className="sol-lab">Its own dedicated account number</span>
                  <span className="sol-acct mono" aria-label="3049420327">
                    {"3049420327".split("").map((d, i) => <span className="dg" key={i}>{d}</span>)}
                  </span>
                  <span className="sol-chip mono">minted on Nomba</span>
                </div>
                <p>Create an invoice — it comes with its <b>own account number</b>. Not yours. Its.</p>
              </div>

              <div className="sol-step sol-step-2">
                <span className="sol-no mono">02</span>
                <div className="sol-card sol-send">
                  <span className="sol-pill mono">paidup.site/pay/x7f2…</span>
                  <span className="sol-wire" aria-hidden="true" />
                  <span className="sol-avatar">DC</span>
                </div>
                <p>Send it to your customer. Whoever pays into that number <b>can only be paying this invoice</b>.</p>
              </div>

              <div className="sol-step sol-step-3">
                <span className="sol-no mono">03</span>
                <div className="sol-card sol-paidrow">
                  <span className="mono">₦450,000 · Dangote Cement</span>
                  <span className="sol-stamp mono">PAID</span>
                </div>
                <p>The moment the transfer lands, PaidUp marks it paid. <b>Automatically.</b></p>
              </div>
            </div>

            <div className="sol-close">
              <p>No spreadsheet. No guessing. The account number <em>is</em> the reference.</p>
              <Link href="/get-started" className="btn-xl sol-cta">End your evening ritual <ArrowRight size={18} /></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
