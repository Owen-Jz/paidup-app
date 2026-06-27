import fs from "fs";
import path from "path";

// Reseed before the e2e run so the core-flow spec starts from the known seed ledger (portable; no rm).
export default function globalSetup() {
  const ledger = path.join(process.cwd(), ".data", "ledger.json");
  try {
    if (fs.existsSync(ledger)) fs.unlinkSync(ledger);
  } catch { /* best effort */ }
}
