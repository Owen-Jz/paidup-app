import QRCode from "qrcode";

// Server-side QR generation -> inline SVG string (no external request, CSP-safe, works offline so the
// demo never depends on a network call). Used by the public customer payment page. (POLISH M1)
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" });
}

/** Human-readable transfer instruction encoded into the QR (a payer scans it to see how to pay). */
export function payInstruction(opts: { amount: number; acctNumber: string; bankName: string; ref: string }): string {
  const naira = `NGN ${Math.round(opts.amount).toLocaleString()}`;
  return `Pay ${naira} to ${opts.acctNumber} (${opts.bankName}) — ref ${opts.ref} via PaidUp`;
}
