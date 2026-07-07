// Pure share-message helpers. WhatsApp is the operating system of Nigerian SME commerce — a "Share on
// WhatsApp" deep link needs no API key or approval (wa.me opens the chat picker with prefilled text).
import { NGN } from "./format.ts";

/** wa.me deep link with prefilled, url-encoded text. No recipient number → opens the contact picker. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** First-send message: here is your invoice + the dedicated pay link. */
export function payMessage(o: { customer: string; id: string; amount: number; url: string }): string {
  return `Hi ${o.customer}, here's your invoice ${o.id} for ${NGN(o.amount)}. ` +
    `Pay from any bank to a dedicated account here: ${o.url}`;
}

/** Follow-up nudge: polite when not yet due, firmer (names the days) once overdue. */
export function reminderMessage(o: { customer: string; id: string; balance: number; url: string; overdueDays: number }): string {
  const lead = o.overdueDays > 0
    ? `a quick reminder that invoice ${o.id} is now ${o.overdueDays} day${o.overdueDays === 1 ? "" : "s"} overdue`
    : `a quick reminder about invoice ${o.id}`;
  return `Hi ${o.customer}, ${lead}. Balance due: ${NGN(o.balance)}. Pay from any bank here: ${o.url}`;
}
