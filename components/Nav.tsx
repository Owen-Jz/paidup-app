"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, FileText, Download, ShieldCheck } from "lucide-react";

export function Nav() {
  const path = usePathname();
  const item = (href: string, label: string, Icon: typeof Radio) => (
    <Link href={href} className={`side-link ${path === href ? "on" : ""}`}>
      <Icon size={18} /><span>{label}</span>
    </Link>
  );
  return (
    <nav className="side-nav">
      <span className="side-label">Workspace</span>
      {item("/app", "Live feed", Radio)}
      {item("/app/invoices", "Invoices", FileText)}
      <span className="side-label">Data</span>
      <a className="side-link data" href="/api/export" title="Download the full reconciliation ledger as CSV">
        <Download size={18} /><span>Export ledger</span>
      </a>
      <a className="side-link data" href="/api/audit?format=csv" title="Download the tamper-evident, hash-chained audit trail">
        <ShieldCheck size={18} /><span>Audit trail</span>
      </a>
    </nav>
  );
}
