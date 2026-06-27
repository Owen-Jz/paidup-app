// Client-safe formatting helpers (no node-only APIs).
import type { PaymentOutcome, InvoiceStatus } from "./types";

export const NGN = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

export const initials = (s: string) =>
  s.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

export const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", overpaid: "Overpaid",
  awaiting: "Awaiting", quarantine: "Unmatched", duplicate: "Duplicate", refunded: "Refunded", reversed: "Reversed",
};

export const STATUS_CLASS: Record<string, string> = {
  paid: "c-paid", partial: "c-partial", overpaid: "c-overpaid",
  awaiting: "c-awaiting", quarantine: "c-quarantine", duplicate: "c-duplicate", refunded: "c-refunded", reversed: "c-reversed",
};

export function shortName(s: string) {
  return s.split("(")[0].trim();
}

export const eventIcon = (o: PaymentOutcome | InvoiceStatus): string =>
  ({ paid: "💸", partial: "◑", overpaid: "⬆", quarantine: "⚠", duplicate: "⟳", refunded: "↩", reversed: "⤺", awaiting: "•" } as Record<string, string>)[o] || "•";

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
