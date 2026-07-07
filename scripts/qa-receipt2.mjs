import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "voice-notes/demo-vo/qa-receipt.png", fullPage: true });
console.log("done");
await browser.close();
