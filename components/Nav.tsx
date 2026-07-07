"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, FileText, Banknote, Download, ShieldCheck, Settings } from "lucide-react";

export function Nav() {
  const path = usePathname();
  const item = (href: string, label: string, Icon: typeof Radio) => (
    <Link href={href} className={`side-link ${path === href ? "on" : ""}`}>
      <Icon size={18} /><span>{label}</span>
    </Link>
  );
  return (
    <nav className="side-nav" data-tour="nav">
      <span className="side-label">Workspace</span>
      {item("/app", "Live feed", Radio)}
      {item("/app/invoices", "Invoices", FileText)}
      {item("/app/withdraw", "Withdraw", Banknote)}
      <span className="side-label">Reports</span>
      {item("/app/reports/ledger", "Ledger (PDF)", Download)}
      {item("/app/reports/audit", "Audit trail (PDF)", ShieldCheck)}
      <span className="side-label">Account</span>
      {item("/app/settings", "Settings", Settings)}
    </nav>
  );
}
