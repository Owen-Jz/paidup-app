import Link from "next/link";
import { Nav } from "@/components/Nav";
import { aiConfigured } from "@/lib/ai";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Server component → reflects the real env. Makes the graceful-degradation story visible: AI on
  // augments reconciliation; AI off, the deterministic engine runs everything unchanged.
  const aiOn = aiConfigured();
  return (
    <>
      <header className="app">
        <Link href="/" className="logo">
          <span className="mark">P</span>
          <span>PaidUp <small>SME invoice reconciliation · on Nomba</small></span>
        </Link>
        <Nav />
        <div className="spacer" />
        <span
          className={`ai-pill ${aiOn ? "on" : "off"}`}
          title={aiOn ? "AI features active (MiniMax) — degrade gracefully to the rule-based engine" : "AI off — running the deterministic engine only"}
        >
          {aiOn ? "✨ AI LIVE" : "✨ AI OFF · RULES"}
        </span>
        <span className="env-pill">● SANDBOX · CRESIOLABS</span>
        <div className="who"><span className="av">OE</span> Oghenebrume</div>
      </header>
      <div className="app-shell">{children}</div>
    </>
  );
}
