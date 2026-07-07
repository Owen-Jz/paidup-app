// Muxes the beat narration MP3s onto the captured screen recording at their exact beat offsets
// (from timeline.json) and encodes a shareable MP4. No re-encode of timing — each narration is
// delayed to its beat start and mixed, then muxed over the video.
//
// Usage: node scripts/demo-mux.mjs <video.webm>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VO = path.join(process.cwd(), "voice-notes", "demo-vo");
const timeline = JSON.parse(fs.readFileSync(path.join(VO, "timeline.json"), "utf8").replace(/^﻿/, ""));
const video = process.argv[2];
if (!video || !fs.existsSync(video)) { console.error("pass the take .webm path"); process.exit(1); }

const beats = timeline.beats;
const inputs = ["-i", video];
const filters = [];
const labels = [];
beats.forEach((b, i) => {
  const mp3 = path.join(VO, `${b.id}.mp3`);
  if (!fs.existsSync(mp3)) { console.error("missing narration", mp3); process.exit(1); }
  inputs.push("-i", mp3);
  const ms = Math.round(b.start * 1000);
  const idx = i + 1; // input 0 is the video
  filters.push(`[${idx}:a]adelay=${ms}|${ms}[a${idx}]`);
  labels.push(`[a${idx}]`);
});
filters.push(`${labels.join("")}amix=inputs=${beats.length}:normalize=0:dropout_transition=0,dynaudnorm[aout]`);

const out = path.join(VO, "PaidUp-demo.mp4");
const args = [
  "-y",
  ...inputs,
  "-filter_complex", filters.join(";"),
  "-map", "0:v:0",
  "-map", "[aout]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart",
  "-shortest",
  out,
];
console.log("ffmpeg muxing →", out);
const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
if (r.status !== 0) { console.error("ffmpeg failed", r.status); process.exit(1); }
console.log("done:", out);
