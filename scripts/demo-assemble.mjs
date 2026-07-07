// Final assembly: intro (full-frame) + body (inside the MacBook composite) + outro (full-frame),
// narration clips placed at exact beat offsets, music ducked under the voice, styled subtitles
// burned in. Produces voice-notes/demo-vo/PaidUp-demo-final.mp4.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VO = path.join(process.cwd(), "voice-notes", "demo-vo");
const j = (f) => JSON.parse(fs.readFileSync(path.join(VO, f), "utf8").replace(/^﻿/, ""));
const dur = (f) => parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString());

const introT = j("intro-timeline.json");
const bodyT = j("timeline.json");
const outroT = j("outro-timeline.json");
const D_INTRO = dur(path.join(VO, "take", "intro.webm"));
const D_BODY = dur(path.join(VO, "take", "body.webm"));
const D_OUTRO = dur(path.join(VO, "take", "outro.webm"));
const TOTAL = D_INTRO + D_BODY + D_OUTRO;
console.log(`intro=${D_INTRO.toFixed(1)}s body=${D_BODY.toFixed(1)}s outro=${D_OUTRO.toFixed(1)}s total=${TOTAL.toFixed(1)}s`);

// absolute narration offsets in the final cut
const cues = [];
for (const b of introT.beats) cues.push({ id: b.id, at: b.start });
for (const b of bodyT.beats) cues.push({ id: b.id, at: D_INTRO + (bodyT.lead || 0) + b.start });
for (const b of outroT.beats) cues.push({ id: b.id, at: D_INTRO + D_BODY + b.start });

// ---------------- subtitles ----------------
// Written-form text per beat (the TTS files spell things out; subtitles shouldn't).
const SUB = {
  "i1-problem": "Across Nigeria, money moves by bank transfer. But every transfer arrives the same way: an alert, an amount — and no idea what it was for.",
  "i2-pain": "So someone matches alerts to invoices by hand. At midnight. In a spreadsheet. And when it doesn't add up, revenue quietly leaks.",
  "i3-idea": "PaidUp flips the problem. Every invoice gets its own Nomba virtual account — so the account number IS the reference, and payments reconcile themselves.",
  "i4-usecases": "A school collects fees on one account per student. A supplier — one per invoice. A landlord — one per tenancy. A savings group — one per member. Anywhere money arrives by transfer, PaidUp knows exactly what it was for.",
  "i5-live": "And this is not a prototype. It is live in production, on real Nomba rails, proven with real naira. Here it is.",
  "01-landing": "This is PaidUp, running live at paidup.site. Let's sign in to a real workspace.",
  "02-login": "PaidUp is a real multi-tenant product. Every business gets an isolated workspace. Let's sign in.",
  "03-dashboard": "This is the live ledger: invoiced, collected, outstanding, and a reconciliation rate — all computed from the ledger itself. The feed updates in real time as money moves.",
  "04-create": "Create an invoice — a customer, line items, an optional due date. And here is the core idea: PaidUp mints a dedicated Nomba virtual account, live on the production API, that belongs to this invoice alone. The customer just sends money. Nothing to type. No reference to get wrong.",
  "05-paypage": "This is what the customer receives: the account details, a QR code, and a WhatsApp share — because that is how Nigerian business actually talks. Keep your eye on this page.",
  "06-flip": "A transfer arrives. Nomba fires a payment-success webhook. PaidUp verifies the 9-field HMAC signature, matches the virtual account, and reconciles. Watch the page… Settled. The customer sees it the instant the money lands. Real transfers from any Nigerian bank land exactly this way — proven with real naira on this very system.",
  "07-range": "And there is the payment on the business's live feed, the moment it came in. Now the hard cases: an underpayment reconciles as partial, and the balance accumulates. An overpayment flags the surplus — refundable in one tap, with a name check first. And if a refund doesn't settle, the ledger refuses to lie about it.",
  "08-statement": "Every invoice carries an audit-grade statement: payment history, running balance, and a requery action that re-verifies any payment against the bank network.",
  "09-askai": "And the hardest case of all: money with no matching reference. It is quarantined — never lost. Ask AI, and MiniMax reads the narration, the amount, and the sender, then explains in plain English which invoice this almost certainly pays. The AI only suggests. It is grounded to real open invoices, so it cannot invent anything. One click to confirm — and the money finds its home.",
  "10-brief": "The AI brief gives a plain-English read on the whole ledger — written over the computed figures, so it can never invent money. And this sync note ties the ledger out against Nomba's real settled balance, to the naira.",
  "11-reports": "Customer-level clarity: a print-ready ledger report, per-invoice statements, CSV export, and a hash-chained audit log — so history cannot be quietly rewritten.",
  "12-withdraw": "And money out: collected funds pay out to your own bank, with the recipient name confirmed from Nomba before sending, and a write-ahead record so a crash can never double-spend. Money in, to money out. The loop is closed.",
  "13-verify": "The payer gets a receipt with a verification QR. This page proves the payment is real — the answer to fake bank alerts.",
  "o1-close": "PaidUp turns Nomba's virtual-account primitive into a managed reconciliation ledger — exact, partial, overpaid, reversed, and unmatched, all handled. 147 unit tests. HMAC verified against Nomba's own vector. Fails closed in production. Proven with real money on the live API. PaidUp — every transfer finds its invoice.",
};
const AUDIO = j("durations.json");

function chunks(text, maxLen = 92) {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > maxLen && cur) { out.push(cur.trim()); cur = p; }
    else cur = (cur + " " + p).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}
const assT = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
};
let events = "";
for (const c of cues) {
  const text = SUB[c.id]; if (!text) continue;
  const dur = AUDIO[c.id] || 5;
  const cs = chunks(text);
  const totalWords = cs.reduce((s, x) => s + x.split(/\s+/).length, 0);
  let t = c.at;
  for (const line of cs) {
    const w = line.split(/\s+/).length;
    const d = (w / totalWords) * dur;
    events += `Dialogue: 0,${assT(t)},${assT(t + d)},Default,,0,0,0,,${line.replace(/\n/g, " ")}\n`;
    t += d;
  }
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Segoe UI,41,&H001B2115,&H001B2115,&H00DDECF2,&H2EDDECF2,-1,0,0,0,100,100,0,0,3,7,0,2,220,220,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}`;
fs.writeFileSync(path.join(VO, "subs.ass"), ass, "utf8");
console.log(`subtitles: ${events.split("\n").length - 1} cues`);

// ---------------- ffmpeg assembly ----------------
const IN = [];
const add = (...a) => IN.push(...a);
add("-i", path.join(VO, "take", "intro.webm"));   // 0
add("-i", path.join(VO, "take", "body.webm"));    // 1
add("-i", path.join(VO, "take", "outro.webm"));   // 2
add("-i", path.join(VO, "canvas-bg.png"));         // 3
add("-i", path.join(VO, "canvas-frame.png"));      // 4
add("-i", path.join(VO, "music-Wholesome.mp3"));   // 5
const A0 = 6; // narration inputs start here
cues.forEach((c) => add("-i", path.join(VO, `${c.id}.mp3`)));

const F = [];
// video: body inside the MacBook composite, then concat
F.push(`[1:v]scale=1400:875[bs]`);
F.push(`[3:v][bs]overlay=260:64:eof_action=repeat[b1]`);
F.push(`[b1][4:v]overlay=0:0:eof_action=repeat,fps=25[bod]`);
F.push(`[0:v]fps=25,scale=1920:1080[iv]`);
F.push(`[2:v]fps=25,scale=1920:1080[ov]`);
F.push(`[iv][bod][ov]concat=n=3:v=1:a=0,format=yuv420p[vcat]`);
F.push(`[vcat]subtitles='voice-notes/demo-vo/subs.ass'[vfin]`);
// narration at offsets
const nlabels = cues.map((c, i) => {
  const ms = Math.round(c.at * 1000);
  F.push(`[${A0 + i}:a]aresample=48000,adelay=${ms}|${ms}[n${i}]`);
  return `[n${i}]`;
});
F.push(`${nlabels.join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0[nar]`);
F.push(`[nar]asplit=2[narmix][narkey]`);
// music: trim to length, gentle level, fade out, duck under narration
F.push(`[5:a]aresample=48000,atrim=0:${TOTAL.toFixed(2)},volume=0.16,afade=t=in:d=2,afade=t=out:st=${(TOTAL - 4).toFixed(2)}:d=4[mus]`);
F.push(`[mus][narkey]sidechaincompress=threshold=0.02:ratio=10:attack=50:release=900:makeup=1[musd]`);
F.push(`[narmix][musd]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.93[afin]`);

const out = path.join(VO, "PaidUp-demo-final.mp4");
const args = [
  "-y", ...IN,
  "-filter_complex", F.join(";"),
  "-map", "[vfin]", "-map", "[afin]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-t", TOTAL.toFixed(2),
  "-movflags", "+faststart",
  out,
];
console.log("assembling…");
const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], cwd: process.cwd() });
if (r.status !== 0) { console.error(r.stderr.toString().slice(-3000)); process.exit(1); }
console.log("done:", out);
