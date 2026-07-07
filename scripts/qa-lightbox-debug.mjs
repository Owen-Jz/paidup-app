import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3100";
let browser;
try { browser = await chromium.launch({ headless: true, channel: "msedge" }); }
catch { browser = await chromium.launch({ headless: true, channel: "chrome" }); }
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /Watch the demo/ }).click();
await page.locator(".demo-lightbox").waitFor({ timeout: 10000 });
const info = await page.evaluate(() => {
  const lb = document.querySelector(".demo-lightbox");
  const cs = getComputedStyle(lb);
  let inSheets = 0;
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) if (r.cssText?.includes("demo-lightbox")) inSheets++; } catch {}
  }
  return { position: cs.position, zIndex: cs.zIndex, display: cs.display, rulesFound: inSheets };
});
console.log(JSON.stringify(info));
await page.waitForTimeout(1200);
await page.screenshot({ path: "voice-notes/demo-vo/qa-lightbox2.png" });
await browser.close();
