"use client";

// Print / Save-as-PDF trigger (client island; hidden in the printed output via .print-hide).
export function PrintButton({ label = "⤓ Save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn print-hide" onClick={() => window.print()}>
      {label}
    </button>
  );
}
