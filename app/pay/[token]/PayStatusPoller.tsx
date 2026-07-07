"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Polls the public status endpoint while the invoice is unpaid. The instant it flips to paid, refresh
// the server component so the page re-renders its "✓ Payment received" state — no manual reload. This
// is the demo money-shot: real transfer lands → the customer's own screen confirms within seconds.
export function PayStatusPoller({ token }: { token: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (done.current) return;
      try {
        const r = await fetch(`/api/pay-status/${token}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (j.isPaid) { done.current = true; clearInterval(id); router.refresh(); }
      } catch { /* transient — keep polling */ }
    }, 4000);
    return () => clearInterval(id);
  }, [token, router]);
  return null;
}
