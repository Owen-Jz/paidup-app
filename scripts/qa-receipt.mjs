import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3100";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /demo workspace/i }).click();
await page.waitForURL("**/app", { timeout: 60000, waitUntil: "commit" });
const inv = await page.evaluate(async () => {
  const j = await (await fetch("/api/events")).json();
  return (j.invoices || []).find((i) => i.status === "paid" && i.payToken);
});
if (!inv) { console.error("no paid invoice with token"); process.exit(1); }
await page.goto(`${BASE}/pay/${inv.payToken}/receipt`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: "voice-notes/demo-vo/qa-receipt.png", fullPage: true });
console.log(`receipt screenshot for ${inv.id}`);
await browser.close();
