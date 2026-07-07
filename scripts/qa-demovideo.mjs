import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3100";
// Playwright's bundled Chromium has no H.264 — use the installed Edge/Chrome for codec truth
let browser;
try { browser = await chromium.launch({ headless: true, channel: "msedge" }); }
catch { browser = await chromium.launch({ headless: true, channel: "chrome" }); }
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /Watch the demo/ }).click();
await page.locator(".demo-lightbox video").waitFor({ timeout: 15000 });
await page.waitForTimeout(3500); // let playback start
const state = await page.evaluate(() => {
  const v = document.querySelector(".demo-lightbox video");
  return { currentTime: v.currentTime, paused: v.paused, duration: v.duration, error: v.error?.message || null };
});
console.log("video state:", JSON.stringify(state));
await page.screenshot({ path: "voice-notes/demo-vo/qa-lightbox.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("lightbox after ESC:", await page.locator(".demo-lightbox").count());
await browser.close();
