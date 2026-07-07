import { Sidebar } from "@/components/Sidebar";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware guarantees a valid token; this resolves the actual user + workspace for the shell.
  const session = await requireSession();
  const businessName = session?.tenant.businessName ?? "PaidUp";
  const emailName = session?.user.email.split("@")[0] ?? "operator";
  const initials = businessName.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/)
    .map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "PU";
  return (
    <div className="appx">
      <Sidebar businessName={businessName} emailName={emailName} initials={initials} />
      <div className="app-shell">{children}</div>
    </div>
  );
}
