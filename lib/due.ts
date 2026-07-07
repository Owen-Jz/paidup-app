// Pure due-date presentation. Client-safe (Date only). Turns an ISO due date into a human label + an
// overdue flag so the invoices table and the reminder message agree on one source of truth.
export interface DueMeta { label: string; overdue: boolean; days: number }

export function dueMeta(dueDate: string | undefined, now: number = Date.now()): DueMeta {
  if (!dueDate) return { label: "", overdue: false, days: 0 };
  const t = Date.parse(dueDate);
  if (Number.isNaN(t)) return { label: "", overdue: false, days: 0 };
  const days = Math.round((t - now) / 86_400_000);
  if (days < 0) return { label: `Overdue by ${-days}d`, overdue: true, days };
  if (days === 0) return { label: "Due today", overdue: false, days };
  return { label: `Due in ${days}d`, overdue: false, days };
}
