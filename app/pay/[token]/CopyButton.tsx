"use client";

import { useState } from "react";

// Tiny client island for copy-to-clipboard on the otherwise server-rendered payment page.
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={`Copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch { /* clipboard blocked — no-op */ }
      }}
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}
