// Final assembly v2:
//   [intro] [body: 01-05] [m0 phone transfer] [body: 06-07] [m1 hard cases] [body: 08-13] [outro]
// - paper-colour fades between segments
// - chapter title chips (top-left) over the MacBook segments
// - narration muxed at exact offsets, music ducked, subtitles burned
// - uniform speed trim to land ≤ 5:00
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VO = path.join(process.cwd(), "voice-notes", "demo-vo");
const TAKE = path.join(VO, "take");
const j = (f) => JSON.parse(fs.readFileSync(path.join(VO, f), "utf8").replace(/^﻿/, ""));
const probe = (f) => parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString());

const AUDIO = j("durations.json");
const introT = j("intro-timeline.json");
const bodyT = j("timeline.json");
const outroT = j("outro-timeline.json");
const m0T = j("m0-timeline.json");
const m1T = j("m1-timeline.json");
const PAPER = "0xFAF6ED";
const FADE = 0.45;

const bodyBeat = (id) => bodyT.beats.find((b) => b.id === id);
const cutA = bodyT.lead + bodyBeat("06-flip").start;      // phone screen goes before the flip
const cutB = bodyT.lead + bodyBeat("08-statement").start; // hard-cases screen goes before the statement

// head-trims: motion clips open on ~2.6s of empty sheet before slide 1 — keep only a short pre-roll
const PRE = 0.6;
const segs = [
  { name: "intro", file: path.join(TAKE, "intro.webm"), from: Math.max(0, (introT.beats[0].start) - 1.2), to: probe(path.join(TAKE, "intro.webm")) },
  { name: "bodyA", file: path.join(TAKE, "body.webm"), from: 0, to: cutA },
  { name: "m0", file: path.join(TAKE, "m0.webm"), from: Math.max(0, m0T.beats[0].start - PRE), to: probe(path.join(TAKE, "m0.webm")) },
  { name: "bodyB", file: path.join(TAKE, "body.webm"), from: cutA, to: cutB },
  { name: "m1", file: path.join(TAKE, "m1.webm"), from: Math.max(0, m1T.beats[0].start - PRE), to: probe(path.join(TAKE, "m1.webm")) },
  { name: "bodyC", file: path.join(TAKE, "body.webm"), from: cutB, to: probe(path.join(TAKE, "body.webm")) },
  { name: "outro", file: path.join(TAKE, "outro.webm"), from: Math.max(0, outroT.beats[0].start - 1.2), to: probe(path.join(TAKE, "outro.webm")) },
];
let acc = 0;
for (const s of segs) { s.dur = s.to - s.from; s.start = acc; acc += s.dur; }
const TOTAL = acc;
console.log(segs.map((s) => `${s.name}=${s.dur.toFixed(1)}s@${s.start.toFixed(1)}`).join("  "), `total=${TOTAL.toFixed(1)}s`);

// ---- absolute cue offsets ----
const seg = Object.fromEntries(segs.map((s) => [s.name, s]));
const place = (segName, tInSource) => seg[segName].start + (tInSource - seg[segName].from);
const cues = [];
for (const b of introT.beats) cues.push({ id: b.id, at: place("intro", b.start) });
for (const b of bodyT.beats) {
  const t = bodyT.lead + b.start;
  const sn = t < cutA ? "bodyA" : t < cutB ? "bodyB" : "bodyC";
  cues.push({ id: b.id, at: place(sn, t) });
}
cues.push({ id: "m0-transfer", at: place("m0", m0T.beats[0].start) });
cues.push({ id: "m1-hardcases", at: place("m1", m1T.beats[0].start) });
for (const b of outroT.beats) cues.push({ id: b.id, at: place("outro", b.start) });
cues.sort((a, b) => a.at - b.at);

// ---- subtitles + chapter chips ----
const SUB = {
  "i1-problem": "Across Nigeria, money moves by bank transfer. But every transfer arrives the same way: an alert, an amount — and no idea what it was for.",
  "i2-pain": "So someone matches alerts to invoices by hand. At midnight. In a spreadsheet. And when it doesn't add up, revenue quietly leaks.",
  "i3-idea": "PaidUp flips the problem. Every invoice gets its own Nomba virtual account — so the account number is the reference, and payments reconcile themselves.",
  "i4-usecases": "A school collects fees on one account per student. A supplier — one per invoice. A landlord — one per tenancy. A savings group — one per member. Anywhere money arrives by transfer, PaidUp knows exactly what it was for.",
  "i5-live": "And this is not a prototype. It is live in production, on real Nomba rails, proven with real naira. Here it is.",
  "01-landing": "This is PaidUp, running live at paidup.site. Let's sign in to a real workspace.",
  "02-login": "Let's sign in. Every business gets its own isolated workspace — PaidUp is a real multi-tenant product.",
  "03-dashboard": "This is the live ledger: invoiced, collected, outstanding, and a reconciliation rate — all computed from the ledger itself. The feed updates in real time as money moves.",
  "04-create": "Create an invoice — a customer, line items, an optional due date. And here is the core idea: PaidUp mints a dedicated Nomba virtual account, live on the production API, that belongs to this invoice alone. The customer just sends money. Nothing to type. No reference to get wrong.",
  "05-paypage": "This is what the customer receives: the account details, a QR code, and a WhatsApp share — because that is how Nigerian business actually talks. Keep your eye on this page.",
  "m0-transfer": "The customer opens their own banking app — any bank at all — enters the account number, and sends the transfer.",
  "06-flip": "The moment the money lands, Nomba fires a payment-success webhook. PaidUp verifies the 9-field HMAC signature, matches the virtual account, and reconciles. Watch the page… Settled. The customer sees it instantly. Real transfers from any Nigerian bank land exactly this way — proven with real naira on this very system.",
  "07-range": "And there it is on the business's live feed, the moment it came in. And PaidUp handles every shape of payment.",
  "m1-hardcases": "An underpayment reconciles as partial, and the balance accumulates across instalments. An overpayment flags the surplus — refundable in one tap, with the recipient's name confirmed first. And if a refund doesn't settle, the ledger refuses to lie about it.",
  "08-statement": "Every invoice carries an audit-grade statement: payment history, running balance, and a requery action that re-verifies any payment against the bank network.",
  "09-askai": "And the hardest case of all: money with no matching reference. It is quarantined — never lost. Ask AI, and it reads the narration, the amount, and the sender, then explains in plain English which invoice this almost certainly pays. The AI only suggests — grounded to real open invoices, so it cannot invent anything. One click to confirm.",
  "10-brief": "The AI brief gives a plain-English read on the whole ledger — written over the computed figures, so it can never invent money. And this sync note ties the ledger out against Nomba's real settled balance, to the naira.",
  "11-reports": "Customer-level clarity: a print-ready ledger report, per-invoice statements, CSV export, and a hash-chained audit log — so history cannot be quietly rewritten.",
  "12-withdraw": "And money out: collected funds pay out to your own bank, with the recipient name confirmed from Nomba before sending, and a write-ahead record so a crash can never double-spend. Money in, to money out. The loop is closed.",
  "13-verify": "The payer gets a receipt with a verification QR. This page proves the payment is real — the answer to fake bank alerts.",
  "o1-close": "PaidUp turns Nomba's virtual-account primitive into a managed reconciliation ledger — exact, partial, overpaid, reversed, and unmatched, all handled. HMAC verified against Nomba's own vector. Fails closed in production. Proven with real money on the live API. PaidUp — every transfer finds its invoice.",
};
const CHAPTER = {
  "01-landing": "LIVE AT PAIDUP.SITE",
  "02-login": "SIGN IN",
  "03-dashboard": "THE LIVE LEDGER",
  "04-create": "CREATE AN INVOICE",
  "05-paypage": "THE CUSTOMER'S PAY PAGE",
  "06-flip": "MONEY LANDS — RECONCILED LIVE",
  "07-range": "THE LIVE FEED",
  "08-statement": "INVOICE STATEMENT",
  "09-askai": "UNMATCHED → ASK AI",
  "10-brief": "AI BRIEF · BALANCE TIE-OUT",
  "11-reports": "REPORTS & AUDIT",
  "12-withdraw": "WITHDRAW — MONEY OUT",
  "13-verify": "RECEIPT & VERIFY",
};
const assT = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};
function chunks(text, maxLen = 92) {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const out = []; let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > maxLen && cur) { out.push(cur.trim()); cur = p; }
    else cur = (cur + " " + p).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}
let ev = "";
// subtitles
for (const c of cues) {
  const text = SUB[c.id]; if (!text) continue;
  const dur = AUDIO[c.id] || 5;
  const cs = chunks(text);
  const words = cs.reduce((s, x) => s + x.split(/\s+/).length, 0);
  let t = c.at;
  for (const line of cs) {
    const d = (line.split(/\s+/).length / words) * dur;
    ev += `Dialogue: 0,${assT(t)},${assT(t + d)},Default,,0,0,0,,${line}\n`;
    t += d;
  }
}
// chapter chips: from beat start to the next body-cue start in the same segment (or segment end)
const bodyCues = cues.filter((c) => CHAPTER[c.id]);
for (let i = 0; i < bodyCues.length; i++) {
  const c = bodyCues[i];
  const segOf = segs.find((s) => c.at >= s.start - 0.01 && c.at < s.start + s.dur);
  const next = bodyCues[i + 1];
  const end = Math.min(segOf.start + segOf.dur, next && next.at > c.at ? next.at : segOf.start + segOf.dur);
  ev += `Dialogue: 1,${assT(c.at + 0.3)},${assT(end - 0.2)},Chapter,,0,0,0,,{\\fad(260,260)}${CHAPTER[c.id]}\n`;
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Segoe UI,41,&H001B2115,&H001B2115,&H00DDECF2,&H2EDDECF2,-1,0,0,0,100,100,0,0,3,7,0,2,220,220,18,1
Style: Chapter,Consolas,27,&H00486A13,&H00486A13,&H00DDECF2,&H10DDECF2,-1,0,0,0,100,100,2,0,3,9,0,7,84,84,58,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev}`;
fs.writeFileSync(path.join(VO, "subs2.ass"), ass, "utf8");
console.log(`subtitles+chapters: ${ev.split("\n").length - 1} events`);

// ---- ffmpeg graph ----
const IN = [];
const add = (...a) => IN.push(...a);
add("-i", path.join(TAKE, "intro.webm")); // 0
add("-i", path.join(TAKE, "body.webm"));  // 1
add("-i", path.join(TAKE, "m0.webm"));    // 2
add("-i", path.join(TAKE, "m1.webm"));    // 3
add("-i", path.join(TAKE, "outro.webm")); // 4
add("-i", path.join(VO, "canvas-bg.png"));    // 5
add("-i", path.join(VO, "canvas-frame.png")); // 6
add("-i", path.join(VO, "music-Wholesome.mp3")); // 7
const A0 = 8;
cues.forEach((c) => add("-i", path.join(VO, `${c.id}.mp3`)));

const F = [];
// MacBook composite for the whole body once, then trim segments from it
F.push(`[1:v]scale=1400:875[bsc]`);
F.push(`[5:v][bsc]overlay=260:64:eof_action=repeat[bcv]`);
F.push(`[bcv][6:v]overlay=0:0:eof_action=repeat,fps=25,setsar=1[bodyfull]`);
F.push(`[bodyfull]split=3[bf1][bf2][bf3]`);
const segsrc = { intro: "[0:v]", m0: "[2:v]", m1: "[3:v]", outro: "[4:v]" };
const bodyfeed = { bodyA: "[bf1]", bodyB: "[bf2]", bodyC: "[bf3]" };
const vlabels = [];
segs.forEach((s, i) => {
  const src = s.name.startsWith("body") ? bodyfeed[s.name] : segsrc[s.name];
  const pre = s.name.startsWith("body") ? "" : "fps=25,scale=1920:1080,setsar=1,";
  const fin = i === 0 ? "" : `fade=t=in:st=0:d=${FADE}:color=${PAPER},`;
  const fout = i === segs.length - 1 ? "" : `fade=t=out:st=${(s.dur - FADE).toFixed(2)}:d=${FADE}:color=${PAPER},`;
  F.push(`${src}trim=start=${s.from.toFixed(3)}:end=${s.to.toFixed(3)},setpts=PTS-STARTPTS,${pre}${fin}${fout}format=yuv420p[v${i}]`);
  vlabels.push(`[v${i}]`);
});
F.push(`${vlabels.join("")}concat=n=${segs.length}:v=1:a=0[vcat]`);
F.push(`[vcat]subtitles='voice-notes/demo-vo/subs2.ass'[vfin]`);
// narration
const nl = cues.map((c, i) => {
  const ms = Math.round(c.at * 1000);
  F.push(`[${A0 + i}:a]aresample=48000,adelay=${ms}|${ms}[n${i}]`);
  return `[n${i}]`;
});
F.push(`${nl.join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0[nar]`);
F.push(`[nar]asplit=2[narmix][narkey]`);
F.push(`[7:a]aresample=48000,atrim=0:${TOTAL.toFixed(2)},volume=0.16,afade=t=in:d=2,afade=t=out:st=${(TOTAL - 4).toFixed(2)}:d=4[mus]`);
F.push(`[mus][narkey]sidechaincompress=threshold=0.02:ratio=10:attack=50:release=900:makeup=1[musd]`);
F.push(`[narmix][musd]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.93[afin]`);

const mid = path.join(VO, "PaidUp-demo-v2.mp4");
let r = spawnSync("ffmpeg", ["-y", ...IN, "-filter_complex", F.join(";"), "-map", "[vfin]", "-map", "[afin]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
  "-t", TOTAL.toFixed(2), "-movflags", "+faststart", mid], { stdio: ["ignore", "ignore", "pipe"], cwd: process.cwd() });
if (r.status !== 0) { console.error(r.stderr.toString().slice(-4000)); process.exit(1); }
console.log("assembled:", mid, `(${TOTAL.toFixed(1)}s)`);

// ---- speed trim to ≤ 5:00 ----
const target = 299.0;
if (TOTAL > target) {
  const f = TOTAL / target;
  console.log(`speed pass ×${f.toFixed(4)} → ${target}s`);
  const out = path.join(VO, "PaidUp-demo-5min.mp4");
  r = spawnSync("ffmpeg", ["-y", "-i", mid, "-filter_complex",
    `[0:v]setpts=PTS/${f.toFixed(5)},fps=25[v];[0:a]atempo=${f.toFixed(5)}[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) { console.error(r.stderr.toString().slice(-3000)); process.exit(1); }
  console.log("final:", out);
} else {
  fs.copyFileSync(mid, path.join(VO, "PaidUp-demo-5min.mp4"));
  console.log("under 5:00 — no speed pass needed");
}
