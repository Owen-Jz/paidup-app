// Screenshots the landing at several scroll depths to QA the new ambient loops + reveals.
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3100";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: "voice-notes/demo-vo/qa-land-1-hero.png" });
await page.evaluate(() => document.querySelector("#problem")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(2600);
await page.screenshot({ path: "voice-notes/demo-vo/qa-land-2-problem.png" });
await page.waitForTimeout(3600); // catch a different chip in the cycle
await page.screenshot({ path: "voice-notes/demo-vo/qa-land-3-problem-cycle.png" });
await page.evaluate(() => document.querySelector("#why")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(2600);
await page.screenshot({ path: "voice-notes/demo-vo/qa-land-4-why.png" });
await page.evaluate(() => document.querySelector(".cta-card")?.scrollIntoView({ block: "center" }));
await page.waitForTimeout(2200);
await page.screenshot({ path: "voice-notes/demo-vo/qa-land-5-cta.png" });
console.log("5 screenshots done");
await browser.close();
