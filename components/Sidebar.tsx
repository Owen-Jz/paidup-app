"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Nav } from "./Nav";
import { LogoutButton } from "./LogoutButton";

// The app shell's sidebar. Desktop: the fixed vertical rail (unchanged). Small screens: a sticky
// top bar — brand + hamburger — with the full nav (labels, reports, settings, sign-out) in a
// slide-down panel instead of a clipped horizontal scroll strip.
export function Sidebar({ businessName, emailName, initials }: {
  businessName: string; emailName: string; initials: string;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]); // navigating closes the menu

  return (
    <aside className={`side ${open ? "menu-open" : ""}`}>
      <Link href="/" className="side-brand">
        <img src="/logo.svg" alt="" width={34} height={34} className="side-logo" />
        <span className="side-brand-txt">PaidUp<small>Reconciliation · on Nomba</small></span>
      </Link>

      <button type="button" className="side-burger" aria-expanded={open} aria-controls="side-menu"
        aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div className="side-menu" id="side-menu">
        <Nav />
        <div className="side-foot">
          <div className="side-user">
            <span className="av">{initials}</span>
            <div><b>{emailName}</b><small>{businessName}</small></div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
