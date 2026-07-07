"use client";

import { useEffect, useLayoutEffect } from "react";

// GSAP pinning re-parents React-owned nodes (pin-spacers). Cleanup MUST run before React
// removes the DOM on a route change — passive useEffect cleanup runs AFTER removal in React 18
// (→ removeChild NotFoundError, the "Application error" on first nav to /login|/get-started).
// A layout effect's cleanup runs synchronously pre-removal. SSR falls back to useEffect.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scroll choreography for the landing page. Progressive enhancement: every element
 * it touches is fully visible/readable without JS — this only adds motion. Targets
 * data-attributes in the server markup so the page stays a server component.
 *
 * Two GSAP paradigms (per the gpt-taste motion brief), both reduced-motion gated:
 *   1. Scrubbed text reveal — the hero lede dims its words and scrubs them to full
 *      as you read down the fold.
 *   2. Scrubbed "money travels the loop" — a coin runs the connector line of the
 *      four-step reconciliation loop, tied to scroll.
 * Plus: batched section reveals and a one-shot draw-in on the before/after checks.
 */
export function LandingMotion() {
  useIsomorphicLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let ctx: { revert: () => void } | null = null;
    let lenis: InstanceType<typeof import("lenis")["default"]> | null = null;
    let lenisRaf: ((t: number) => void) | null = null;
    let gsapMod: typeof import("gsap")["gsap"] | null = null;
    const cleanups: Array<() => void> = [];

    // Sticky header hairline appears once you leave the very top (runs regardless of reduced-motion).
    const head = document.querySelector<HTMLElement>("[data-head]");
    const onScroll = () => head?.classList.toggle("stuck", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      gsapMod = gsap;

      // Lenis smooth scroll — the whole landing glides, and ScrollTrigger (incl. the
      // pinned story scene) is driven off Lenis's rAF so the two never fight.
      if (!reduce) {
        const { default: Lenis } = await import("lenis");
        const l = new Lenis({ lerp: 0.12, smoothWheel: true });
        lenis = l;
        l.on("scroll", ScrollTrigger.update);
        lenisRaf = (t: number) => l.raf(t * 1000);
        gsap.ticker.add(lenisRaf);
        gsap.ticker.lagSmoothing(0);
      }

      // Reduced motion: make sure nothing is left hidden, then bail on all motion.
      if (reduce) {
        document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
          el.style.opacity = "1";
          el.style.transform = "none";
        });
        return;
      }

      ctx = gsap.context(() => {
        // 1. Batched section reveals — clean rise-in, once.
        const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]");
        reveals.forEach((el) => gsap.set(el, { opacity: 0, y: 22 }));
        ScrollTrigger.batch("[data-reveal]", {
          start: "top 86%",
          once: true,
          onEnter: (els) =>
            gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 }),
        });

        // 2. Hero lede — scrubbed word reveal.
        const lede = document.querySelector<HTMLElement>("[data-words]");
        if (lede && !lede.dataset.split) {
          lede.dataset.split = "1";
          const words = (lede.textContent || "").split(/(\s+)/);
          lede.textContent = "";
          const spans: HTMLElement[] = [];
          for (const w of words) {
            if (w.trim() === "") { lede.appendChild(document.createTextNode(w)); continue; }
            const s = document.createElement("span");
            s.className = "w";
            s.textContent = w;
            lede.appendChild(s);
            spans.push(s);
          }
          gsap.fromTo(
            spans,
            { opacity: 0.18 },
            {
              opacity: 1,
              stagger: 0.5,
              ease: "none",
              scrollTrigger: { trigger: lede, start: "top 78%", end: "bottom 52%", scrub: true },
            }
          );
        }

        // 3. The loop — a coin travels the connector line as the section scrolls.
        //    Driven by transform x (not `left`) so we only ever animate transform/opacity.
        const loop = document.querySelector<HTMLElement>("[data-loop]");
        const coin = loop?.querySelector<HTMLElement>("[data-loop-coin]");
        if (loop && coin) {
          gsap.fromTo(
            coin,
            { x: 0 },
            {
              x: () => loop.clientWidth,
              ease: "none",
              scrollTrigger: { trigger: loop, start: "top 72%", end: "bottom 70%", scrub: 0.5, invalidateOnRefresh: true },
            }
          );
        }

        // 4. Before/after — checks and crosses draw in on enter.
        gsap.utils.toArray<HTMLElement>("[data-ba] li").forEach((li, i) => {
          gsap.fromTo(
            li,
            { opacity: 0, x: -10 },
            {
              opacity: 1, x: 0, duration: 0.5, ease: "power2.out", delay: i * 0.06,
              scrollTrigger: { trigger: li, start: "top 90%", once: true },
            }
          );
        });

        // 5. Trust-strip figures count up from zero the first time they scroll into view.
        gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
          const target = Number(el.dataset.count || "0");
          const suffix = el.dataset.suffix || "";
          const obj = { v: 0 };
          gsap.to(obj, {
            v: target, duration: 1.4, ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 92%", once: true },
            onUpdate: () => { el.textContent = Math.round(obj.v) + suffix; },
          });
        });

        // 6. Hero pointer parallax — the lady drifts with the cursor and the brand pixels drift
        //    further (depth), while the promise-card watermark eases the opposite way. Fine-pointer
        //    devices only; motion already gated by the reduce guard above.
        const hero = document.querySelector<HTMLElement>(".bento-hero");
        if (hero && window.matchMedia("(pointer:fine)").matches) {
          const img = hero.querySelector<HTMLElement>(".bh-photo img");
          const wm = hero.querySelector<HTMLElement>(".bh-watermark");
          const pxEls = gsap.utils.toArray<HTMLElement>(".bh-photo .px");
          const q = (el: HTMLElement | null, p: string, d: number) =>
            el ? gsap.quickTo(el, p, { duration: d, ease: "power3" }) : null;
          const ix = q(img, "x", 0.7), iy = q(img, "y", 0.7);
          const wx = q(wm, "x", 1.0), wy = q(wm, "y", 1.0);
          const pxq = pxEls.map((el, i) => ({
            x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3" }),
            y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3" }),
            d: (i % 2 ? -1 : 1) * (12 + i * 5),
          }));
          const onMove = (e: PointerEvent) => {
            const r = hero.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width - 0.5;
            const ny = (e.clientY - r.top) / r.height - 0.5;
            ix?.(nx * -16); iy?.(ny * -11);
            wx?.(nx * 10); wy?.(ny * 8);
            pxq.forEach((p) => { p.x(nx * p.d); p.y(ny * p.d); });
          };
          const onLeave = () => {
            ix?.(0); iy?.(0); wx?.(0); wy?.(0);
            pxq.forEach((p) => { p.x(0); p.y(0); });
          };
          hero.addEventListener("pointermove", onMove);
          hero.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            hero.removeEventListener("pointermove", onMove);
            hero.removeEventListener("pointerleave", onLeave);
          });
        }
      });

      // The pinned sections (StoryScroll, LoopScroll) mount asynchronously and the large hero photo
      // loads AFTER the first pin calculation — both shift layout and can leave a pin's start stale.
      // Recompute once everything has settled (window load + a short tail) so every pin engages.
      const refreshAll = () => ScrollTrigger.refresh();
      window.addEventListener("load", refreshAll);
      const rt = window.setTimeout(refreshAll, 700);
      cleanups.push(() => { window.removeEventListener("load", refreshAll); window.clearTimeout(rt); });
    })();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cleanups.forEach((fn) => fn());
      if (lenisRaf && gsapMod) gsapMod.ticker.remove(lenisRaf);
      lenis?.destroy();
      ctx?.revert();
    };
  }, []);

  return null;
}
