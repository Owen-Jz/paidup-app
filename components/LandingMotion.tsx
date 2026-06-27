"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let ctx: { revert: () => void } | null = null;

    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

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
      });
    })();

    return () => ctx?.revert();
  }, []);

  return null;
}
