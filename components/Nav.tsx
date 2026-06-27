"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} className={path === href ? "on" : ""}>{label}</Link>
  );
  return (
    <nav className="nav">
      {link("/app", "Live")}
      {link("/app/invoices", "Invoices")}
    </nav>
  );
}
