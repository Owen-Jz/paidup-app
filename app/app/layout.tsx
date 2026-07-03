import Link from "next/link";
import { Nav } from "@/components/Nav";
import { LogoutButton } from "@/components/LogoutButton";
import { aiConfigured } from "@/lib/ai";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server component → reflects the real env. Makes the graceful-degradation story visible: AI on
  // augments reconciliation; AI off, the deterministic engine runs everything unchanged.
  const aiOn = aiConfigured();
  // Middleware guarantees a valid token; this resolves the actual user + workspace for the shell.
  const session = await requireSession();
  const businessName = session?.tenant.businessName ?? "PaidUp";
  const emailName = session?.user.email.split("@")[0] ?? "operator";
  const initials = businessName.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/)
    .map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "PU";
  return (
    <div className="appx">
      <aside className="side">
        <Link href="/" className="side-brand">
          <span className="mark">P</span>
          <span className="side-brand-txt">PaidUp<small>Reconciliation · on Nomba</small></span>
        </Link>

        <Nav />

        <div className="side-foot">
          <span
            className={`ai-pill ${aiOn ? "on" : "off"}`}
            title={aiOn ? "AI features active (MiniMax) — degrade gracefully to the rule-based engine" : "AI off — running the deterministic engine only"}
          >
            {aiOn ? "✨ AI LIVE" : "✨ AI OFF · RULES"}
          </span>
          <span className="env-pill">● SANDBOX · {businessName.toUpperCase().slice(0, 18)}</span>
          <div className="side-user">
            <span className="av">{initials}</span>
            <div><b>{emailName}</b><small>{businessName}</small></div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-shell">{children}</div>
    </div>
  );
}
