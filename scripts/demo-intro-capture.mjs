// Records the animated intro and outro (scripts/demo-intro.html) as 1920×1080 webm clips,
// pacing each slide to its narration duration (+pad). Produces:
//   voice-notes/demo-vo/take/intro.webm  (+ intro-timeline.json)
//   voice-notes/demo-vo/take/outro.webm  (+ outro-timeline.json)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VO = path.join(process.cwd(), "voice-notes", "demo-vo");
const OUT = path.join(VO, "take");
const AUDIO = JSON.parse(fs.readFileSync(path.join(VO, "durations.json"), "utf8").replace(/^﻿/, ""));
const PAD = 1.2;

const PARTS = {
  intro: ["i1-problem", "i2-pain", "i3-idea", "i4-usecases", "i5-live"],
  outro: ["o1-close"],
  m0: ["m0-transfer"],
  m1: ["m1-hardcases"],
};
const which = process.argv[2] || "both";
// extra query args (e.g. acct/bank/name/amt for the phone slide): --acct=1234567890
const query = process.argv.slice(3).filter((a) => a.startsWith("--")).map((a) => a.slice(2)).join("&");
const html = pathToFileURL(path.join(process.cwd(), "scripts", "demo-intro.html")).href + (query ? `?${query}` : "");

async function record(part) {
  const ids = PARTS[part];
  const plan = ids.map((id) => ({ id, dur: (AUDIO[id] || 8) + PAD }));
  const total = plan.reduce((s, p) => s + p.dur, 0);
  console.log(`${part}: ${plan.map((p) => `${p.id}=${p.dur.toFixed(1)}s`).join("  ")}  total=${total.toFixed(1)}s`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  });
  const tCreate = Date.now(); // video timeline starts ≈ page creation
  const page = await ctx.newPage();
  await page.goto(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // settle fonts/paint before the clock starts
  const t0 = Date.now();
  const lead = (t0 - tCreate) / 1000; // measured head of clip before slide 1 fires
  console.log(`  measured lead: ${lead.toFixed(2)}s`);
  await page.evaluate((p) => window.__start(p), plan);
  await page.waitForFunction(() => window.__done === true, null, { timeout: (total + 20) * 1000 });
  await page.waitForTimeout(400);
  const video = page.video();
  await ctx.close();
  await browser.close();
  const tmp = await video.path();
  const dest = path.join(OUT, `${part}.webm`);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(tmp, dest);
  let t = lead;
  const beats = plan.map((p) => { const b = { id: p.id, start: t }; t += p.dur; return b; });
  fs.writeFileSync(path.join(VO, `${part}-timeline.json`), JSON.stringify({ total: t, beats }, null, 2));
  console.log(`✔ ${dest} (${((Date.now() - t0) / 1000).toFixed(1)}s wall)`);
}

if (which === "both" || which === "intro") await record("intro");
if (which === "both" || which === "outro") await record("outro");
if (which === "m0") await record("m0");
if (which === "m1") await record("m1");
