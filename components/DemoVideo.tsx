"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";

// Hero CTA that plays the 5-minute demo film in an on-brand lightbox — the visitor never
// leaves the page. The video ships as a same-origin static asset (public/demo.mp4, faststart),
// so the strict CSP (default-src 'self') covers it and it streams with range requests.
export function DemoVideo() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const close = useCallback(() => {
    videoRef.current?.pause();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, close]);

  return (
    <>
      <button type="button" className="btn-ghost-xl" onClick={() => setOpen(true)}>
        <Play size={16} /> Watch the demo
      </button>
      {open &&
        // Portal to <body>: the hero cards animate in, and an animated ancestor creates a
        // stacking context that traps a fixed overlay's z-index beneath sibling cards.
        createPortal(
          <div className="demo-lightbox" role="dialog" aria-modal="true" aria-label="PaidUp demo video" onClick={close}>
            <div className="demo-lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="demo-lightbox-close" onClick={close} aria-label="Close video">
                <X size={20} />
              </button>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the film carries burned-in subtitles */}
              <video ref={videoRef} src="/demo.mp4" poster="/demo-poster.jpg" controls autoPlay playsInline />
              <div className="demo-lightbox-cap mono">PaidUp · 5-minute demo — recorded live against paidup.site</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
