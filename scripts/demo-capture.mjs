// Records the 5-minute demo video against a running PaidUp instance by driving a real browser
// through the DEMO.md beats: stages fresh props per take (range invoice, AI-resolver quarantine),
// mints a real VA on camera, fires genuinely signed webhooks mid-take, and logs a beat timeline
// so the narration track can be muxed at exact offsets.
//
// Usage:
//   node scripts/demo-capture.mjs                 # full take against https://paidup.site (records video)
//   node scripts/demo-capture.mjs --dry           # fast selector-validation run against http://localhost:3100
//
// Output: voice-notes/demo-vo/take/<video>.webm + voice-notes/demo-vo/timeline.json

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const BASE = DRY ? "http://localhost:3100" : "https://paidup.site";
const WEBHOOK = DRY ? "http://localhost:3100/api/webhook" : "https://rimose-rayan-better.ngrok-free.dev/api/webhook";
const VO_DIR = path.join(process.cwd(), "voice-notes", "demo-vo");
const OUT_DIR = path.join(VO_DIR, "take");
const EMAIL = "demo@paidup.app";
const PASSWORD = "LedgerDemo2026";
const PAD = DRY ? 0.2 : 1.4; // seconds appended after each beat's narration

// ---- narration durations (from beats.json mp3s, measured with ffprobe) ----
const AUDIO = JSON.parse(fs.readFileSync(path.join(VO_DIR, "durations.json"), "utf8").replace(/^﻿/, ""));

// ---- env: webhook signing key ----
const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const SECRET = (envFile.match(/^NOMBA_WEBHOOK_SECRET=(.+)$/m) || [])[1]?.trim();
if (!SECRET) { console.error("NOMBA_WEBHOOK_SECRET not found in .env.local"); process.exit(1); }

function fireWebhook(ref, amount, narration, sender) {
  return new Promise((resolve, reject) => {
    const args = ["scripts/send-signed-webhook.mjs", WEBHOOK, ref, String(amount)];
    if (narration) args.push(narration);
    if (sender) args.push(sender);
    const p = spawn(process.execPath, args, { env: { ...process.env, NOMBA_WEBHOOK_SECRET: SECRET } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`webhook ${ref} failed: ${out}`))));
  });
}

// ---- API helpers (cookie jar via fetch) ----
let cookie = "";
async function api(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) },
  });
  const setC = res.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

// ---- beat engine ----
const timeline = [];
let t0 = 0;
let current = null;
async function beat(page, id) {
  await endBeat(page); // pace out the previous beat first
  current = { id, start: (Date.now() - t0) / 1000 };
  timeline.push(current);
  console.log(`▶ ${id} @ ${current.start.toFixed(1)}s`);
}
async function endBeat(page) {
  if (!current) return;
  const want = DRY ? 0.3 : (AUDIO[current.id] || 3) + PAD;
  const elapsed = (Date.now() - t0) / 1000 - current.start;
  if (elapsed < want) await page.waitForTimeout((want - elapsed) * 1000);
  current = null;
}
// wait until at least `sec` seconds into the current beat (choreography anchor)
async function atBeatTime(page, sec) {
  const target = current.start + sec;
  const now = (Date.now() - t0) / 1000;
  if (now < target) await page.waitForTimeout((target - now) * 1000);
}

// Fill a controlled React input and confirm the value actually stuck before moving on —
// fill() can outrun React's onChange under load, submitting an empty field.
async function typeAndVerify(page, sel, value, dry) {
  const el = page.locator(sel);
  for (let attempt = 0; attempt < 5; attempt++) {
    await el.click();
    if (dry) await el.fill(value);
    else { await el.fill(""); await el.pressSequentially(value, { delay: 70 }); }
    await page.waitForTimeout(150);
    if ((await el.inputValue()) === value) return;
    await el.fill(value);
    await page.waitForTimeout(150);
    if ((await el.inputValue()) === value) return;
  }
  throw new Error(`could not set ${sel}`);
}

// Element zoom: scale the element itself in place (lifted-card look). Safe on pages with
// position:fixed chrome (sidebar/modals/drawers), where a page-level transform would re-anchor
// fixed elements to the document and wreck the layout mid-shot.
async function zoomElement(page, selector, scale = 1.3, holdMs = 3000) {
  const ok = await page.evaluate(
    ({ sel, sc }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.dataset.prevStyle = el.getAttribute("style") || "";
      el.style.transition = "transform .9s cubic-bezier(.3,0,.2,1), box-shadow .9s ease";
      el.style.transformOrigin = "50% 50%";
      el.style.position = el.style.position || "relative";
      el.style.zIndex = "60";
      el.style.background = getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)" ? "var(--card, #FFFDF8)" : "";
      el.style.boxShadow = "0 26px 52px -22px rgba(21,33,27,.45)";
      el.style.borderRadius = getComputedStyle(el).borderRadius === "0px" ? "12px" : "";
      el.style.transform = `scale(${sc})`;
      return true;
    },
    { sel: selector, sc: scale }
  );
  if (!ok) { console.warn(`  element-zoom target missing: ${selector}`); return; }
  await page.waitForTimeout(1000 + holdMs);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.style.transform = "scale(1)";
    setTimeout(() => el.setAttribute("style", el.dataset.prevStyle || ""), 950);
  }, selector);
  await page.waitForTimeout(1000);
}

// Cinematic zoom: scale the page toward an element's center (camera push-in), hold, pull back.
// ONLY safe on pages without position:fixed chrome (the public pay pages) — a transformed html
// re-anchors fixed elements (sidebar, modal-bg, drawer-bg) to the document and breaks the shot.
async function zoomTo(page, selector, scale = 1.55, holdMs = 3000) {
  const ok = await page.evaluate(
    ({ sel, sc }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cx = r.left + window.scrollX + r.width / 2;
      const cy = r.top + window.scrollY + r.height / 2;
      const h = document.documentElement;
      h.style.transition = "transform 1.15s cubic-bezier(.3,0,.2,1)";
      h.style.transformOrigin = `${cx}px ${cy}px`;
      h.style.transform = `scale(${sc})`;
      return true;
    },
    { sel: selector, sc: scale }
  );
  if (!ok) { console.warn(`  zoom target missing: ${selector}`); return; }
  await page.waitForTimeout(1250 + holdMs);
  await page.evaluate(() => {
    const h = document.documentElement;
    h.style.transform = "scale(1)";
  });
  await page.waitForTimeout(1250);
  await page.evaluate(() => {
    const h = document.documentElement;
    h.style.transition = ""; h.style.transform = ""; h.style.transformOrigin = "";
  });
}

async function smoothScroll(page, totalPx, stepPx = 120, stepMs = 90) {
  const steps = Math.round(Math.abs(totalPx) / stepPx);
  const dir = totalPx > 0 ? stepPx : -stepPx;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dir);
    await page.waitForTimeout(stepMs);
  }
}

async function pollInvoiceStatus(page, id, status, timeoutMs = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    const st = await page.evaluate(async (invId) => {
      const r = await fetch("/api/events");
      const j = await r.json();
      return (j.invoices || []).find((i) => i.id === invId)?.status || null;
    }, id);
    if (st === status) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`invoice ${id} never reached ${status}`);
}

// ================================ MAIN ================================
console.log(`${DRY ? "DRY RUN" : "RECORDING"} against ${BASE}`);

// ---- stage per-take props over the API ----
let login = await api("/api/login", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
if (login.status !== 200) { console.error("login failed", login.status, login.body); process.exit(1); }
const mk = async (customer, amount, dueDate) => {
  const r = await api("/api/invoices", { method: "POST", body: JSON.stringify({ customer, amount, dueDate, useNomba: false }) });
  if (r.status !== 200 && r.status !== 201) throw new Error(`invoice create failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.invoice;
};
const rangeInv = await mk("Food Concepts West", 38000);
// Unique name + unique amount per take: retakes leave twin invoices behind, and the resolver
// can legitimately pick a twin over this take's target — so there must never be a twin.
const uniqAmt = 51500 + (Date.now() % 9) * 1200;
const targetInv = await mk("Enugu Motors", uniqAmt);
// Exact-amount + sender-name overlap → the resolver picks targetInv decisively; accept → paid.
await fireWebhook("INV-1050", uniqAmt, "Trf for parts invoice", "ENUGU MOTORS LTD");
console.log(`props: range=${rangeInv.id} target=${targetInv.id} (₦${uniqAmt}) + quarantine staged`);

// ---- browser ----
fs.mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ...(DRY ? {} : { recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } } }),
});
await context.addInitScript(() => {
  try { localStorage.setItem("paidup_tour_v1", "1"); } catch {}
  // visible cursor for the recording (headless video has no OS cursor)
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText =
      "position:fixed;z-index:2147483647;width:16px;height:16px;border-radius:50%;background:rgba(14,86,56,.85);border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45);pointer-events:none;left:-40px;top:-40px;transition:transform .08s";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 8 + "px"; c.style.top = e.clientY - 8 + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.72)"), true);
    addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true);
  });
});
const tCreate = Date.now(); // video timeline starts ≈ page creation
const page = await context.newPage();
page.setDefaultTimeout(DRY ? 60000 : 30000);
await page.waitForTimeout(400);
t0 = Date.now();
const lead = (t0 - tCreate) / 1000;
console.log(`measured lead: ${lead.toFixed(2)}s`);

try {
  // 01 — landing story (short beat: the animated intro carries the story now)
  await beat(page, "01-landing");
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  await smoothScroll(page, 1500, 150, DRY ? 20 : 70);
  // pre-navigate during this beat's tail so "Let's sign in" starts ON the login page
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });

  // 02 — sign in (narration LEADS with "Let's sign in" — typing must happen while it plays)
  await beat(page, "02-login");
  page.on("response", (r) => { if (r.url().includes("/api/login")) console.log("  login api:", r.status()); });
  // Show the credentials being entered (nice on camera), then use the race-free one-click
  // demo-workspace button — its handler logs in with hardcoded creds, so it can't submit an
  // empty React-state field the way a typed submit can under load. Retried so a transient
  // hiccup can't kill an unattended take.
  let loggedIn = false;
  for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
    if (attempt === 1) {
      await page.waitForTimeout(DRY ? 50 : 600); // let "Let's sign in" land before typing starts
      await typeAndVerify(page, "#email", EMAIL, DRY);
      await typeAndVerify(page, "#pw", PASSWORD, DRY);
      await page.waitForTimeout(DRY ? 100 : 700);
    }
    await page.getByRole("button", { name: /demo workspace/i }).click();
    loggedIn = await page.waitForURL("**/app", { timeout: 30000, waitUntil: "commit" }).then(() => true).catch(() => false);
    if (!loggedIn) {
      console.error(`  login attempt ${attempt} failed at ${page.url()} — ${await page.locator("form .err, form").first().innerText().catch(() => "")}`.slice(0, 120));
      await page.waitForTimeout(1500);
      if (!page.url().includes("/login")) await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    }
  }
  if (!loggedIn) { await page.screenshot({ path: path.join(VO_DIR, "login-debug.png") }); throw new Error("login failed after 3 attempts"); }
  await page.locator("text=Invoiced").first().waitFor({ timeout: 60000 }).catch(() => {});

  // 03 — dashboard
  await beat(page, "03-dashboard");
  await page.waitForTimeout(1500);
  await smoothScroll(page, 500, 100, DRY ? 20 : 110);
  await smoothScroll(page, -500, 100, DRY ? 20 : 80);
  // pre-open the New-invoice modal in this beat's tail so narration 04 starts ON the open form
  await page.goto(BASE + "/app/invoices", { waitUntil: "domcontentloaded" });
  const newBtn = page.getByRole("button", { name: /New invoice/ });
  await newBtn.first().waitFor({ timeout: 30000 });
  await newBtn.first().click();
  try {
    await page.locator("#ni-cust").waitFor({ timeout: 15000 });
  } catch (e) {
    await newBtn.first().click(); // retry the modal open
    await page.locator("#ni-cust").waitFor({ timeout: 15000 }).catch(async () => {
      await page.screenshot({ path: path.join(VO_DIR, "create-debug.png") });
      throw e;
    });
  }

  // 04 — create the hero invoice (REAL VA in a full take); form fills slowly, on camera
  await beat(page, "04-create");
  await page.waitForTimeout(DRY ? 50 : 800);
  await page.locator("#ni-cust").click();
  await page.locator("#ni-cust").pressSequentially("Kaduna Textiles Ltd", { delay: DRY ? 5 : 95 });
  await page.locator('input[aria-label="Item 1 description"]').click();
  await page.locator('input[aria-label="Item 1 description"]').pressSequentially("Ankara fabric — 3 bundles", { delay: DRY ? 5 : 70 });
  await page.locator('input[aria-label="Item 1 amount"]').click();
  await page.locator('input[aria-label="Item 1 amount"]').pressSequentially("85000", { delay: DRY ? 5 : 160 });
  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  await page.locator("#ni-due").fill(due);
  await atBeatTime(page, DRY ? 0 : 12.5);
  await page.getByRole("button", { name: "Create invoice + account" }).click();
  await page.getByRole("button", { name: "Done" }).waitFor({ timeout: 30000 }); // success modal (VA on screen)
  const heroId = await page.evaluate(async () => {
    const r = await fetch("/api/events");
    const j = await r.json();
    const inv = (j.invoices || []).find((i) => i.customer === "Kaduna Textiles Ltd" && i.status === "awaiting");
    return inv ? { id: inv.id, token: inv.payToken, acct: inv.acctNumber, bank: inv.bankName, name: inv.acctName } : null;
  });
  if (!heroId) throw new Error("hero invoice not found after create");
  console.log(`hero invoice: ${heroId.id} · VA ${heroId.acct} (${heroId.bank})`);
  // element-zoom the success modal itself — a page-level transform would re-anchor the fixed
  // modal-bg to the document and throw the modal out of the viewport (the blank-blur bug)
  await zoomElement(page, ".modal", 1.22, DRY ? 300 : 3800);
  await endBeat(page); // hold the VA modal on screen through the rest of the narration
  await page.getByRole("button", { name: "Done" }).click();
  // pre-navigate to the customer's pay page during this beat's tail
  await page.goto(`${BASE}/pay/${heroId.token}`, { waitUntil: "domcontentloaded" });

  // 05 — the customer's pay page (already navigated; the phone motion screen splices AFTER this beat)
  await beat(page, "05-paypage");
  await page.waitForTimeout(1500);
  await smoothScroll(page, 350, 90, DRY ? 20 : 100);
  const wa = page.locator("text=Share this on WhatsApp");
  if (await wa.count()) await wa.first().hover();
  await smoothScroll(page, -350, 90, DRY ? 20 : 80); // end the beat back on the account details

  // 06 — money lands; the page flips by itself.
  // In the final cut the phone-transfer motion screen sits between 05 and 06, so the transfer
  // has "just been sent" — fire the webhook right away.
  await beat(page, "06-flip");
  await atBeatTime(page, DRY ? 0 : 1.5);
  await fireWebhook(heroId.id, 85000);
  console.log("hero webhook fired");
  await pollInvoiceStatus(page, heroId.id, "paid", 40000); // reconciled server-side
  // The PayStatusPoller flips it live; give it a beat, then guarantee the settled paint with reloads.
  let flipped = await page.locator(".pay-settled").waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  for (let i = 0; i < 4 && !flipped; i++) {
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    flipped = await page.locator(".pay-settled").waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  }
  if (!flipped) {
    const ps = await page.evaluate(async (tok) => { try { return await (await fetch(`/api/pay-status/${tok}`)).text(); } catch (e) { return String(e); } }, heroId.token);
    console.error("pay-status api:", String(ps).slice(0, 200));
    await page.screenshot({ path: path.join(VO_DIR, "flip-debug.png") });
    throw new Error("pay page never showed settled");
  }
  console.log("pay page shows settled");
  // page-level push-in is safe here: the public pay page has no fixed chrome
  await zoomTo(page, ".pay-settled", 1.5, DRY ? 300 : 4200);
  // pre-navigate to the live feed during this beat's tail
  await endBeat(page);
  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await page.locator(".feed .event").first().waitFor({ timeout: 20000 }).catch(() => {});

  // 07 — the payment on the live feed (short beat; the hard-cases motion screen splices after it)
  await beat(page, "07-range");
  await zoomElement(page, ".feed .event", 1.18, DRY ? 300 : 3200); // the hero payment, top of the feed
  // land the partial + overpaid history now (shown in the statement beat after the motion screen)
  await fireWebhook(rangeInv.id, 20000);
  await pollInvoiceStatus(page, rangeInv.id, "partial");
  await fireWebhook(rangeInv.id, 25000);
  await pollInvoiceStatus(page, rangeInv.id, "overpaid");
  await page.waitForTimeout(2600); // let the 2s poll paint both events

  // 08 — statement drawer
  await beat(page, "08-statement");
  await page.goto(BASE + "/app/invoices", { waitUntil: "domcontentloaded" });
  await page.locator(`tr:has-text("${rangeInv.id}")`).first().click();
  await page.locator(".drawer").waitFor();
  await page.waitForTimeout(1500);
  await page.locator(".drawer").hover();
  await smoothScroll(page, 420, 90, DRY ? 20 : 110);
  await endBeat(page);
  await page.locator(".drawer .copy", { hasText: "✕" }).click();

  // 09 — Ask AI on the staged quarantine (the resolver card only renders under the Attention filter)
  await beat(page, "09-askai");
  await page.goto(BASE + "/app/invoices?filter=attn", { waitUntil: "domcontentloaded" });
  await page.locator(".quarantine").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  // Work strictly inside OUR staged card — older seeded quarantine items may sit above it.
  const card = page.locator(".qrow", { hasText: "ENUGU MOTORS" }).first();
  await card.waitFor({ timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  await atBeatTime(page, DRY ? 0 : 4);
  await card.getByRole("button", { name: /Ask AI/ }).click();
  await card.locator(".qs-why").waitFor({ timeout: 25000 }); // AI (≤8s) or heuristic fallback
  console.log("AI suggestion shown");
  // element-zoom the whole card (the fixed sidebar rules out a page-level transform here)
  await card.evaluate((el) => (el.id = "zoom-target-qrow"));
  await zoomElement(page, "#zoom-target-qrow", 1.28, DRY ? 300 : 5000); // let the reasoning be read
  await atBeatTime(page, DRY ? 0 : 20); // let the reasoning land
  await card.getByRole("button", { name: "Accept", exact: true }).click();
  await pollInvoiceStatus(page, targetInv.id, "paid");
  console.log("quarantine accepted → reconciled to paid");

  // 10 — AI brief + the tie-out
  await beat(page, "10-brief");
  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Generate brief/ }).click();
  await page.locator(".brief-text").waitFor({ timeout: 25000 });
  // element-zoom the brief card itself (fixed sidebar again rules out the page transform)
  await zoomElement(page, ".railcard.brief", 1.32, DRY ? 300 : 4200);
  await atBeatTime(page, DRY ? 0 : 10);
  const syncNote = page.locator("text=last synced").first();
  if (await syncNote.count()) await syncNote.hover();

  // 11 — reports
  await beat(page, "11-reports");
  await page.goto(BASE + "/app/reports/ledger", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await smoothScroll(page, 500, 110, DRY ? 20 : 95);
  await atBeatTime(page, DRY ? 0 : 7);
  await page.goto(BASE + "/app/reports/audit", { waitUntil: "domcontentloaded" });
  await smoothScroll(page, 400, 110, DRY ? 20 : 95);

  // 12 — withdraw
  await beat(page, "12-withdraw");
  await page.goto(BASE + "/app/withdraw", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await smoothScroll(page, 300, 90, DRY ? 20 : 110);

  // 13 — receipt + verify
  await beat(page, "13-verify");
  await page.goto(`${BASE}/pay/${heroId.token}/receipt`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await smoothScroll(page, 420, 100, DRY ? 20 : 90);
  await atBeatTime(page, DRY ? 0 : 5.5);
  await page.goto(`${BASE}/pay/${heroId.token}/verify`, { waitUntil: "domcontentloaded" });

  // (the animated outro carries the close — the body ends on the verify page)
  await endBeat(page);

  const total = (Date.now() - t0) / 1000;
  console.log(`✔ take complete — ${total.toFixed(1)}s`);
  fs.writeFileSync(path.join(VO_DIR, "timeline.json"), JSON.stringify({ total, lead, hero: heroId, range: rangeInv.id, target: targetInv.id, beats: timeline }, null, 2));
} finally {
  await context.close(); // flushes the video
  await browser.close();
}
if (!DRY) {
  const vids = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
  console.log(`video file(s): ${vids.join(", ")} in ${OUT_DIR}`);
}
