// Renders the backdrop (opaque) and MacBook frame (transparent) PNGs for the composite.
import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const html = pathToFileURL(path.join(process.cwd(), "scripts", "demo-frame.html")).href;
const VO = path.join(process.cwd(), "voice-notes", "demo-vo");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.goto(html + "?layer=bg");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(VO, "canvas-bg.png") });

await page.goto(html + "?layer=frame");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(VO, "canvas-frame.png"), omitBackground: true });

await browser.close();
console.log("rendered canvas-bg.png + canvas-frame.png");
