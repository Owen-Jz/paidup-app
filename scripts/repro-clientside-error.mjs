// Reproduce the "Application error: a client-side exception" on www.paidup.site.
// Walks the real first-visit path: landing -> click "Get started" (client-side nav),
// then fresh-context landing -> "Sign in". Captures console errors + page exceptions.
import { chromium } from "playwright";

const BASE = process.env.TARGET || "https://www.paidup.site";

async function walk(label, clickText) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(); // fresh profile = true first-time visitor
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 6).join("\n")}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console.error] ${m.text()}`); });
  page.on("requestfailed", (r) => errors.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`));

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => errors.push(`[goto /] ${e.message}`));
  const landingErrors = errors.length;

  const link = page.locator(`a:has-text("${clickText}")`).first();
  await link.click({ timeout: 15000 }).catch((e) => errors.push(`[click ${clickText}] ${e.message}`));
  await page.waitForTimeout(6000); // let the client nav settle / crash

  const url = page.url();
  const body = (await page.textContent("body").catch(() => "")) || "";
  const crashed = body.includes("Application error");
  console.log(`\n===== ${label} =====`);
  console.log(`landed on: ${url}`);
  console.log(`shows "Application error": ${crashed}`);
  console.log(`errors on landing (before click): ${landingErrors}`);
  if (errors.length) { console.log("--- captured errors ---"); errors.forEach((e) => console.log(e)); }
  else console.log("no errors captured");
  await browser.close();
  return crashed;
}

const a = await walk("landing -> Get started", "Get started");
const b = await walk("landing -> Sign in", "Sign in");
process.exit(a || b ? 2 : 0);
