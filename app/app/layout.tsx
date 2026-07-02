import Link from "next/link";
import { Nav } from "@/components/Nav";
import { aiConfigured } from "@/lib/ai";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Server component → reflects the real env. Makes the graceful-degradation story visible: AI on
  // augments reconciliation; AI off, the deterministic engine runs everything unchanged.
  const aiOn = aiConfigured();
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
          <span className="env-pill">● SANDBOX · CRESIOLABS</span>
          <div className="side-user">
            <span className="av">OE</span>
            <div><b>Oghenebrume</b><small>Cresiolabs</small></div>
          </div>
        </div>
      </aside>

      <div className="app-shell">{children}</div>
    </div>
  );
}
