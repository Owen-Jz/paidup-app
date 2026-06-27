"use client";

// Print / Save-as-PDF trigger for the receipt (client island; hidden in the printed output via CSS).
export function PrintButton() {
  return (
    <button type="button" className="btn print-hide" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
