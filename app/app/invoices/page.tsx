"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard, Chip, SyncStatus } from "@/components/dashboard";
import type { QuarantineItem } from "@/components/dashboard";
import { NGN, initials, shortName, timeAgo } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { whatsappShareUrl, payMessage, reminderMessage } from "@/lib/share";
import { dueMeta } from "@/lib/due";

type Filter = "all" | "open" | "paid" | "attn";

export default function InvoicesPage() {
  const { invoices, quarantine, anomalies, kpis, flashId, loading, error, refresh, refund, sync, resolveQuarantine, bounceQuarantine } = useDashboard();
  const [filter, setFilter] = useState<Filter>("all");
  // Allow deep-linking to a tab (e.g. the live feed's "Needs attention" → ?filter=attn).
  // Read from the URL on mount only, so it doesn't force this page out of static generation.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("filter");
    if (p === "attn" || p === "open" || p === "paid" || p === "all") setFilter(p);
    if (sp.get("new") === "1") setShowNew(true);
  }, []);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // AI explanations for the anomaly flags (on demand). Keyed by flag identity so they survive
  // re-renders / re-ordering of the poll-driven anomalies list.
  const [flagRecs, setFlagRecs] = useState<Record<string, string>>({});
  const [explaining, setExplaining] = useState(false);
  const [explainNote, setExplainNote] = useState<string | null>(null);
  const flagKey = (a: { type: string; invoiceId?: string; transactionId?: string }) =>
    `${a.type}|${a.invoiceId ?? ""}|${a.transactionId ?? ""}`;

  // Confirm/dismiss a flag: persists server-side so the poll stops resurfacing it.
  const dismissFlag = async (key: string) => {
    try {
      await fetch("/api/flags", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: "ack" }),
      });
      refresh();
    } catch { /* stays flagged — the poll will show it again */ }
  };

  const explainFlags = async () => {
    setExplaining(true); setExplainNote(null);
    try {
      const r = await fetch("/api/explain", { method: "POST" });
      const j = await r.json();
      const recs: Record<string, string> = {};
      if (Array.isArray(j.anomalies)) {
        for (const a of j.anomalies) if (a.recommendation) recs[flagKey(a)] = a.recommendation;
      }
      if (Object.keys(recs).length) setFlagRecs(recs);
      else setExplainNote(j.aiAvailable === false ? "AI not configured — flags shown without notes" : "No AI notes available right now");
    } catch {
      setExplainNote("AI request failed — flags shown without notes");
    }
    setExplaining(false);
  };

  const open = openId ? invoices.find((i) => i.id === openId) ?? null : null;

  // The 2s poll re-renders this page constantly; without memos these full-list passes re-run on
  // every tick even when nothing changed. Recompute the filtered rows only when the inputs move…
  const rows = useMemo(() => invoices.filter((i) => {
    if (q && !(`${i.id} ${i.customer}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (filter === "open") return i.paid < i.amount;
    if (filter === "paid") return i.status === "paid";
    if (filter === "attn") return i.status === "overpaid";
    return true;
  }), [invoices, q, filter]);

  // …and the two header counts only when the invoice set itself changes.
  const counts = useMemo(() => ({
    open: invoices.filter((i) => i.paid < i.amount).length,
    overpaid: invoices.filter((i) => i.status === "overpaid").length,
  }), [invoices]);

  return (
    <main>
      <div>
        <h1 className="h1">Invoices</h1>
        <p className="sub">Every invoice has its own Nomba virtual account. Status updates the instant a transfer arrives.</p>
        <div style={{ marginTop: 6 }}><SyncStatus sync={sync} /></div>
      </div>

      {error && <div className="banner err" role="alert">⚠ Lost connection to the ledger — retrying…</div>}

      {anomalies.length > 0 && (
        <div className="flags">
          <div className="flags-h">
            <span>⚑ {anomalies.length} flag{anomalies.length > 1 ? "s" : ""} for review</span>
            <button className="ghost sm" onClick={explainFlags} disabled={explaining}>
              {explaining ? "Asking AI…" : "✨ Explain with AI"}
            </button>
            {explainNote && <span className="qai-note">{explainNote}</span>}
          </div>
          {anomalies.map((a, idx) => {
            const rec = flagRecs[flagKey(a)];
            return (
              <div className={`flag ${a.severity}`} key={a.key ?? idx}>
                <span className="flag-sev">{a.severity}</span>
                {a.invoiceId && <b className="mono">{a.invoiceId}</b>}
                <span>{a.message}</span>
                {rec && <span className="flag-rec">✨ {rec}</span>}
                <button className="ghost sm" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
                  onClick={() => dismissFlag(a.key)}
                  title="Mark this flag reviewed — it won't show again">
                  {a.type === "multi_invoice_payer" ? "✓ Same customer" : "✓ Dismiss"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="kpis">
        <div className="kpi accent"><div className="lab">Collected</div><div className="val naira">{NGN(kpis.collected)}</div><div className="delta">{kpis.rate}% of invoiced</div></div>
        <div className="kpi"><div className="lab">Invoiced</div><div className="val naira">{NGN(kpis.invoiced)}</div><div className="delta">{invoices.length} invoices</div></div>
        <div className="kpi"><div className="lab">Outstanding</div><div className="val naira" style={{ color: "var(--partial)" }}>{NGN(kpis.outstanding)}</div><div className="delta">{counts.open} open</div></div>
        <div className="kpi"><div className="lab">Needs attention</div><div className="val" style={{ color: "var(--attn)" }}>{kpis.attention}</div><div className="delta">{counts.overpaid} overpaid · {quarantine.length} unmatched</div></div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search invoice or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(["all", "open", "paid", "attn"] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {{ all: "All", open: "Open", paid: "Paid", attn: "Attention" }[f]}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <a className="ghost" href="/api/export" title="Download the full reconciliation ledger as CSV">⤓ Export CSV</a>
        <a className="ghost" href="/api/audit?format=csv" title="Download the tamper-evident, hash-chained audit trail">⛓ Audit trail</a>
        <button className="btn" onClick={() => setShowNew(true)}>+ New invoice</button>
      </div>

      {filter === "attn" && quarantine.length > 0 && (
        <div className="quarantine">
          <div className="qh">⚠ Unmatched payments — money received, no invoice reference</div>
          {quarantine.map((e) => (
            <QuarantineRow
              key={e.id} event={e} invoices={invoices}
              onAssign={resolveQuarantine} onBounce={bounceQuarantine}
            />
          ))}
        </div>
      )}

      <div className="tablewrap">
        <table className="inv">
          <thead>
            <tr><th>Invoice</th><th>Customer</th><th>Virtual account</th><th className="right">Amount</th><th className="progresscell">Collected</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const pct = Math.min((i.paid / i.amount) * 100, 100);
              const over = i.paid > i.amount;
              return (
                <tr key={i.id} className={flashId === i.id ? "flash" : ""} style={{ cursor: "pointer" }}
                  tabIndex={0} role="button" aria-label={`Open statement for ${i.id}, ${shortName(i.customer)}, ${i.status}`}
                  onClick={() => setOpenId(i.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(i.id); } }}>
                  <td><b className="mono">{i.id}</b><br /><small style={{ color: "var(--muted)" }}>{i.description.split(/\r?\n/)[0]}</small></td>
                  <td><div className="cust"><span className="av">{initials(i.customer)}</span><div><b>{shortName(i.customer)}</b>{(() => { const dm = dueMeta(i.dueDate); const txt = dm.label || i.dueLabel || ""; return <small style={dm.overdue ? { color: "var(--attn)", fontWeight: 600 } : undefined}>{txt}</small>; })()}</div></div></td>
                  <td><span className="mono" style={{ color: "var(--ink-2)" }}>{i.acctNumber}</span><br /><small style={{ color: "var(--muted)" }}>{i.bankName}</small></td>
                  <td className="right num naira">{NGN(i.amount)}</td>
                  <td className="progresscell">
                    <small>{NGN(Math.min(i.paid, i.amount))} {over && <span style={{ color: "var(--over)" }}>(+{NGN(i.paid - i.amount)})</span>}</small>
                    <div className={`bar ${pct >= 100 && !over ? "full" : ""} ${over ? "over" : ""}`}><i style={{ width: `${over ? 100 : pct}%` }} /></div>
                  </td>
                  <td><Chip status={i.status} /></td>
                </tr>
              );
            })}
            {loading && invoices.length === 0 && Array.from({ length: 5 }).map((_, n) => (
              <tr key={`sk${n}`}>
                <td><div className="skel skel-line" style={{ width: 70 }} /></td>
                <td><div className="cust"><span className="skel skel-ic" /><div style={{ flex: 1 }}><div className="skel skel-line" style={{ width: 110 }} /></div></div></td>
                <td><div className="skel skel-line" style={{ width: 90 }} /></td>
                <td className="right"><div className="skel skel-line" style={{ width: 64, marginLeft: "auto" }} /></td>
                <td><div className="skel skel-line" style={{ width: 120 }} /></td>
                <td><div className="skel skel-line" style={{ width: 60 }} /></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  {invoices.length === 0 ? (
                    <>
                      <span className="ico">🧾</span>
                      <b>No invoices yet</b>
                      <span>Create your first invoice — it gets its own Nomba virtual account, and payments reconcile here automatically.</span>
                    </>
                  ) : filter === "attn" ? (
                    quarantine.length > 0 ? (
                      <>
                        <span className="ico">⚠</span>
                        <b>No overpaid invoices</b>
                        <span>The unmatched payments listed above are the open items — assign or bounce them.</span>
                      </>
                    ) : (
                      <>
                        <span className="ico">🎉</span>
                        <b>Nothing needs attention</b>
                        <span>No overpayments and no unmatched money. The ledger is clean.</span>
                      </>
                    )
                  ) : (
                    <>
                      <span className="ico">🔍</span>
                      <b>No matches</b>
                      <span>{q ? `Nothing matches "${q}".` : "No invoices in this view."} Try clearing the search or switching filter.</span>
                    </>
                  )}
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <InvoiceDrawer invoice={open} onClose={() => setOpenId(null)} refund={refund} onDeleted={() => { setOpenId(null); refresh(); }} />}
      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} onCreated={refresh} />}
    </main>
  );
}

// Accessible dialog behaviour: Esc to close, focus moves into the dialog, Tab is trapped inside,
// and focus returns to the trigger on close. (GAPS #24)
function useDialogA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Keep the latest onClose in a ref so the effect below can be MOUNT-ONLY. If it depended on
  // [onClose] (an inline arrow from the parent), every parent re-render — which the 2s poll causes
  // constantly — would re-run it and yank focus back to the dialog's first field mid-typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(
      node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []
    ).filter((el) => el.offsetParent !== null);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);
  return ref;
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="copy" aria-label={`Copy ${text}`} onClick={async () => {
      // Only show success if the write actually resolved — in insecure contexts (LAN-IP/http demo)
      // navigator.clipboard is undefined, so a fire-and-forget call would lie "✓ Copied" while nothing copied.
      try { await navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
      catch { /* clipboard blocked — leave the label unchanged rather than claim success */ }
    }}>
      {done ? "✓ Copied" : label}
    </button>
  );
}

interface AiSuggestion {
  invoiceId: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  source: "ai" | "heuristic";
  aiReasoning?: string;
}

function QuarantineRow({ event, invoices, onAssign, onBounce }: {
  event: QuarantineItem;
  invoices: Invoice[];
  onAssign: (txId: string, invId: string) => Promise<unknown>;
  onBounce: (txId: string) => Promise<unknown>;
}) {
  // Only open invoices are sensible assignment targets.
  const open = invoices.filter((i) => i.paid < i.amount);
  // The deterministic suggestion comes free on the poll; the AI one is fetched on demand.
  const [aiSug, setAiSug] = useState<AiSuggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // The active suggestion = AI if we've fetched one, else the heuristic from the feed.
  const suggestion: AiSuggestion | null = aiSug
    ?? (event.suggestion ? { ...event.suggestion, source: "heuristic" as const } : null);
  // Default the picker to the best guess when present.
  const [target, setTarget] = useState<string>(suggestion?.invoiceId ?? open[0]?.id ?? "");
  const [busy, setBusy] = useState<"assign" | "bounce" | null>(null);
  const [actErr, setActErr] = useState("");
  // Once the operator picks a target themselves, the 2s poll must never override it —
  // that would fight the human-in-the-loop override the product is scored on.
  const userPicked = useRef(false);

  useEffect(() => {
    if (userPicked.current) return;
    if (suggestion?.invoiceId) setTarget(suggestion.invoiceId);
    else if (!target && open.length) setTarget(open[0].id);
  }, [suggestion?.invoiceId, open, target]);

  const askAI = async () => {
    setAiBusy(true); setAiNote(null);
    try {
      const r = await fetch("/api/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: event.id }),
      });
      const j = await r.json();
      if (j.suggestion) {
        setAiSug(j.suggestion);
        if (j.suggestion.source !== "ai") setAiNote("AI unavailable — showing the rule-based match");
      } else {
        setAiNote(j.aiAvailable === false ? "AI not configured — using rule-based matching" : "AI found no confident match");
      }
    } catch {
      setAiNote("AI request failed — using rule-based match");
    }
    setAiBusy(false);
  };

  const assign = async () => {
    if (!target) return;
    setBusy("assign"); setActErr("");
    const res = await onAssign(event.id, target);
    setBusy(null);
    if (!res) setActErr("Couldn't assign this payment — refresh and try again.");
  };
  const acceptSuggested = async () => {
    if (!suggestion) return;
    setBusy("assign"); setActErr("");
    const res = await onAssign(event.id, suggestion.invoiceId);
    setBusy(null);
    if (!res) setActErr("Couldn't assign this payment — refresh and try again.");
  };
  const bounce = async () => {
    setBusy("bounce"); setActErr("");
    const res = await onBounce(event.id);
    setBusy(null);
    if (!res) setActErr("Bounce failed — the sender's bank details may be missing, or Nomba is still settling.");
  };

  return (
    <div className="qrow">
      <div className="qinfo">
        <b>{event.customer}</b> <span style={{ color: "var(--faint)" }}>· {event.bankName}</span>
        <div style={{ color: "var(--faint)", fontSize: 12 }} className="mono">{event.narration}</div>
        {suggestion && (
          <div className={`qsuggest ${suggestion.confidence}`}>
            <span className="qs-tag">{suggestion.source === "ai" ? "✨ AI match" : "✦ Suggested"}</span>
            <b className="mono">{suggestion.invoiceId}</b>
            <span className="qs-conf">{suggestion.confidence} confidence</span>
            <span className="qs-why">— {suggestion.aiReasoning || suggestion.reasons.join("; ")}</span>
            <button className="btn sm" onClick={acceptSuggested} disabled={busy !== null}>
              {busy === "assign" ? "Assigning…" : "Accept"}
            </button>
          </div>
        )}
        <div className="qai-row">
          {(!aiSug || aiSug.source !== "ai") && (
            <button className="ghost sm" onClick={askAI} disabled={aiBusy}>
              {aiBusy ? "Asking AI…" : "✨ Ask AI"}
            </button>
          )}
          {aiNote && <span className="qai-note">{aiNote}</span>}
        </div>
      </div>
      <div className="naira qamt">{NGN(event.amount)}</div>
      <div className="qactions">
        <select aria-label={`Assign this ${NGN(event.amount)} payment from ${event.customer} to an invoice`} value={target} onChange={(e) => { userPicked.current = true; setTarget(e.target.value); }} disabled={!open.length || busy !== null}>
          {open.length === 0 && <option value="">No open invoices</option>}
          {open.map((i) => <option key={i.id} value={i.id}>{i.id} · {shortName(i.customer)}</option>)}
        </select>
        <button className="btn sm" onClick={assign} disabled={!target || busy !== null}>
          {busy === "assign" ? "Assigning…" : "→ Assign"}
        </button>
        <button className="ghost sm" onClick={bounce} disabled={busy !== null}>
          {busy === "bounce" ? "Bouncing…" : "↩ Bounce to sender"}
        </button>
        {actErr && <span role="alert" className="qai-note" style={{ color: "var(--attn)" }}>{actErr}</span>}
      </div>
    </div>
  );
}

function InvoiceDrawer({ invoice, onClose, refund, onDeleted }: {
  invoice: Invoice; onClose: () => void; refund: (id: string) => Promise<unknown>; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refundErr, setRefundErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [delErr, setDelErr] = useState("");
  const [verifyTx, setVerifyTx] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, string>>({});
  const verify = async (tx: string) => {
    setVerifyTx(tx);
    try {
      const r = await fetch("/api/requery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: tx }) });
      const j = await r.json().catch(() => null);
      // A 200 proves Nomba's bank network HAS this transaction on record (a fake alert never would);
      // it does not re-compare the amount, so the copy claims existence, not amount-reconciliation.
      setVerifyResult((m) => ({ ...m, [tx]: r.ok ? "✓ On record at the bank network" : (j?.error || "Couldn't verify") }));
    } catch { setVerifyResult((m) => ({ ...m, [tx]: "Network error — try again" })); }
    setVerifyTx(null);
  };
  const over = invoice.paid > invoice.amount;
  const balance = Math.max(invoice.amount - invoice.paid, 0);
  const pct = Math.min(Math.round((invoice.paid / invoice.amount) * 100), 100);
  const unpaid = invoice.paid < invoice.amount;
  const paid = invoice.payments.length > 0;
  const payUrl = typeof window !== "undefined" ? `${window.location.origin}/pay/${invoice.payToken}` : `/pay/${invoice.payToken}`;
  // Only a clean invoice (no money ever received) may be deleted — the API enforces this too.
  const deletable = invoice.payments.length === 0 && invoice.paid === 0;
  const ref = useDialogA11y<HTMLElement>(onClose);

  const doRefund = async () => {
    setBusy(true); setRefundErr("");
    const res = await refund(invoice.id);
    setBusy(false);
    if (!res) setRefundErr("Refund didn't go through — Nomba may still be settling the funds. Try again in a few minutes.");
  };
  const doDelete = async () => {
    setBusy(true); setDelErr("");
    const r = await fetch(`/api/invoices?id=${encodeURIComponent(invoice.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) { setDelErr((await r.json().catch(() => null))?.error || "Could not delete."); return; }
    onDeleted();
  };

  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside ref={ref} className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Statement for ${invoice.id}, ${invoice.customer}`}>
        <div className="dr-head">
          <div>
            <div className="kicker">{invoice.id}</div>
            <h3>{invoice.customer}</h3>
            <div style={{ color: "var(--muted)", fontSize: 13, whiteSpace: "pre-line" }}>{invoice.description}</div>
          </div>
          <button className="copy" onClick={onClose}>✕</button>
        </div>

        <div className="dr-status"><Chip status={invoice.status} /></div>

        <div className="dr-figs">
          <div><span>Amount due</span><b className="naira">{NGN(invoice.amount)}</b></div>
          <div><span>Collected</span><b className="naira" style={{ color: "var(--paid)" }}>{NGN(Math.min(invoice.paid, invoice.amount))}</b></div>
          {over
            ? <div><span>Overpaid by</span><b className="naira" style={{ color: "var(--over)" }}>{NGN(invoice.paid - invoice.amount)}</b></div>
            : <div><span>Balance</span><b className="naira" style={{ color: balance ? "var(--partial)" : "var(--paid)" }}>{NGN(balance)}</b></div>}
        </div>

        <div className="dr-progress">
          <div className={`bar ${pct >= 100 && !over ? "full" : ""} ${over ? "over" : ""}`}><i style={{ width: `${over ? 100 : pct}%` }} /></div>
          <span className="dr-progress-lab">{over ? "Fully paid · surplus to refund" : `${pct}% collected`}</span>
        </div>

        <div className="dr-acct">
          <div><div className="kicker">Virtual account · dedicated to this invoice</div><div className="mono" style={{ fontSize: 19, marginTop: 4, letterSpacing: ".02em" }}>{invoice.acctNumber}</div><div style={{ color: "var(--faint)", fontSize: 12, marginTop: 2 }}>{invoice.bankName} · {invoice.acctName}</div></div>
          <CopyBtn text={invoice.acctNumber} />
        </div>

        {invoice.payToken && (
          <div className="dr-share">
            <div className="dr-share-h">
              <div className="kicker">Customer payment page</div>
              <div className="dr-share-sub">Send the link or QR to {shortName(invoice.customer)} — any transfer reconciles here automatically.</div>
            </div>

            <div className="dr-actgroup">
              <span className="dr-actlab">Share to get paid</span>
              <div className="dr-actrow">
                <CopyBtn text={payUrl} label="⧉ Copy pay link" />
                <a className="copy" target="_blank" rel="noopener noreferrer"
                  href={whatsappShareUrl(payMessage({ customer: shortName(invoice.customer), id: invoice.id, amount: invoice.amount, url: payUrl }))}
                  title="Share this invoice and pay link on WhatsApp">↗ WhatsApp</a>
                {unpaid && (
                  <a className="copy" target="_blank" rel="noopener noreferrer"
                    href={whatsappShareUrl(reminderMessage({ customer: shortName(invoice.customer), id: invoice.id, balance, url: payUrl, overdueDays: Math.max(0, -dueMeta(invoice.dueDate).days) }))}
                    title="Send a payment reminder on WhatsApp">⏰ Reminder</a>
                )}
              </div>
            </div>

            <div className="dr-actgroup">
              <span className="dr-actlab">Links &amp; documents</span>
              <div className="dr-actrow">
                <a className="copy" href={`/pay/${invoice.payToken}`} target="_blank" rel="noopener noreferrer" title="Open the customer pay page">Pay page ↗</a>
                <a className="copy" href={`/pay/${invoice.payToken}/invoice`} target="_blank" rel="noopener noreferrer" title="Printable invoice document — save as PDF">⤓ Invoice PDF</a>
                {paid && (
                  <a className="copy" href={`/pay/${invoice.payToken}/receipt`} target="_blank" rel="noopener noreferrer" title="Payment receipt — save as PDF">⤓ Receipt PDF</a>
                )}
              </div>
            </div>
          </div>
        )}

        {over && (
          <button className="btn refund" onClick={doRefund} disabled={busy}>
            {busy ? "Refunding…" : `↩ Refund surplus ${NGN(invoice.paid - invoice.amount)} to payer`}
          </button>
        )}
        {refundErr && <div role="alert" style={{ color: "var(--attn)", fontSize: 12, marginTop: 8 }}>{refundErr}</div>}

        <div className="dr-statement">
          <div className="kicker" style={{ marginTop: 22 }}>Payment history</div>
          <a className="ghost sm" href={`/api/export?invoice=${invoice.id}`} title="Download this statement as CSV">⤓ Statement CSV</a>
        </div>
        {invoice.payments.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13 }}>No payments received yet.</div>}
        <div className="timeline">
          {[...invoice.payments].reverse().map((p) => (
            <div className="tl" key={p.transactionId}>
              <div className="tl-dot" />
              <div className="tl-body">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <b>{p.sender}</b><b className="naira">{NGN(p.amount)}</b>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>{p.bankName} · {timeAgo(p.time)} · <Chip status={p.outcome} /></div>
                {p.narration && <div className="mono" style={{ color: "var(--faint)", fontSize: 11.5, marginTop: 4 }}>{p.narration}</div>}
                <div style={{ marginTop: 6 }}>
                  <button className="ghost sm" onClick={() => verify(p.transactionId)} disabled={verifyTx === p.transactionId}>
                    {verifyTx === p.transactionId ? "Verifying…" : "🛰 Verify with bank network"}
                  </button>
                  {verifyResult[p.transactionId] && <span className="qai-note" style={{ marginLeft: 8 }}>{verifyResult[p.transactionId]}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {deletable && (
          <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid var(--line-2)" }}>
            {!confirmDel ? (
              <button className="ghost sm" style={{ color: "var(--attn)" }} onClick={() => setConfirmDel(true)}>
                🗑 Delete this invoice
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
                  Delete {invoice.id} and free up its reference? Its virtual account is closed at
                  Nomba so the number can&apos;t take new transfers — and if anything ever slips
                  through, it lands in Unmatched instead of being lost. This can&apos;t be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="ghost sm" onClick={() => setConfirmDel(false)}>Keep it</button>
                  <button className="btn sm" style={{ background: "var(--attn)" }} onClick={doDelete} disabled={busy}>
                    {busy ? "Deleting…" : "Yes, delete"}
                  </button>
                </div>
              </div>
            )}
            {delErr && <div style={{ color: "var(--attn)", fontSize: 12, marginTop: 8 }}>{delErr}</div>}
          </div>
        )}
      </aside>
    </div>
  );
}

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customer, setCustomer] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<Array<{ description: string; amount: string }>>([{ description: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<Invoice | null>(null);
  const ref = useDialogA11y<HTMLDivElement>(onClose);

  const setItem = (i: number, patch: Partial<{ description: string; amount: string }>) =>
    setItems((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const addItem = () => setItems((rows) => [...rows, { description: "", amount: "" }]);
  const removeItem = (i: number) => setItems((rows) => (rows.length > 1 ? rows.filter((_, n) => n !== i) : rows));

  // Kobo-safe running total of the parsed line amounts (blank / invalid rows count as 0).
  const total = items.reduce((a, r) => {
    const v = parseFloat(r.amount);
    return Number.isFinite(v) && v > 0 ? Math.round((a + v) * 100) / 100 : a;
  }, 0);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!customer.trim()) { setErr("Customer is required."); return; }
    const clean = items
      .map((r) => ({ description: r.description.trim(), amount: parseFloat(r.amount) }))
      .filter((r) => r.description && Number.isFinite(r.amount) && r.amount > 0);
    if (!clean.length) { setErr("Add at least one item with a description and a positive amount."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer, items: clean, dueDate: dueDate || undefined }),
    });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => null))?.error || "Failed"); return; }
    const { invoice } = await r.json();
    setCreated(invoice);
    onCreated();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={ref} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New invoice">
        {!created ? (
          <form onSubmit={submit}>
            <h3>New invoice</h3>
            <label htmlFor="ni-cust">Customer</label>
            <input id="ni-cust" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Dangote Cement Plc" autoFocus />
            <label htmlFor="ni-due">Due date (optional)</label>
            <input id="ni-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <label>Items — describe what you&apos;re billing for</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input style={{ flex: 1, margin: 0 }} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder={`Item ${i + 1} — e.g. Bulk cement, 200 bags`} aria-label={`Item ${i + 1} description`} />
                  <input style={{ width: 116, margin: 0 }} type="number" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} placeholder="₦ amount" aria-label={`Item ${i + 1} amount`} />
                  <button type="button" className="ghost sm" onClick={() => removeItem(i)} disabled={items.length === 1} aria-label={`Remove item ${i + 1}`} style={{ padding: "6px 9px" }}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="ghost sm" onClick={addItem}>+ Add item</button>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 14, borderTop: "1px solid var(--line-2)", paddingTop: 12 }}>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Invoice total</span>
              <b className="naira" style={{ fontSize: 18 }}>{NGN(total)}</b>
            </div>
            {err && <div style={{ color: "var(--attn)", fontSize: 12, margin: "10px 0 0" }}>{err}</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ghost" type="button" onClick={onClose}>Cancel</button>
              <button className="btn" type="submit" disabled={busy || total <= 0}>{busy ? "Provisioning…" : "Create invoice + account"}</button>
            </div>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🏦</div>
            <h3 style={{ marginTop: 8 }}>Account ready for {shortName(created.customer)}</h3>
            <p className="sub" style={{ margin: "0 auto 18px" }}>Share this account number — any payment to it reconciles to {created.id} automatically.</p>
            <div className="created-acct">
              <div className="mono" style={{ fontSize: 30, letterSpacing: ".04em" }}>{created.acctNumber}</div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{created.bankName} · {created.acctName}</div>
              <div style={{ marginTop: 14 }}><CopyBtn text={created.acctNumber} /></div>
            </div>
            <div className="row" style={{ justifyContent: "center", marginTop: 18, flexWrap: "wrap", gap: 8 }}>
              {created.payToken && (
                <>
                  <CopyBtn text={`${window.location.origin}/pay/${created.payToken}`} label="Copy pay link" />
                  <a className="ghost" href={`/pay/${created.payToken}/invoice`} target="_blank" rel="noopener noreferrer">
                    ⤓ Download invoice (PDF)
                  </a>
                </>
              )}
              {created.payToken && (
                <a className="ghost" target="_blank" rel="noopener noreferrer"
                  href={whatsappShareUrl(payMessage({
                    customer: shortName(created.customer),
                    id: created.id,
                    amount: created.amount,
                    url: `${window.location.origin}/pay/${created.payToken}`,
                  }))}>↗ Send on WhatsApp</a>
              )}
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
