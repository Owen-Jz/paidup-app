// Server-only AI client (MiniMax). The AI moat's foundation. EVERYTHING here is built to degrade
// gracefully: if MINIMAX_API_KEY is unset, the network fails, it times out, or the model returns
// junk, every entry point returns null and the caller falls back to its deterministic engine. AI
// AUGMENTS the money path; it can never break it. Verified live against MiniMax-Text-01 (OpenAI-shape).

const API_KEY = process.env.MINIMAX_API_KEY || "";
const BASE = process.env.MINIMAX_BASE || "https://api.minimax.io/v1";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-Text-01";
const TIMEOUT_MS = Number(process.env.MINIMAX_TIMEOUT_MS || 8000);

export function aiConfigured(): boolean {
  return Boolean(API_KEY);
}

export interface ChatOpts {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * One chat turn. Returns the assistant's text, or null on ANY failure (no key, HTTP error,
 * MiniMax status_code != 0, timeout, empty content). Never throws — callers branch on null.
 */
export async function chat(user: string, opts: ChatOpts = {}): Promise<string | null> {
  if (!API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: user });

    const r = await fetch(`${BASE}/text/chatcompletion_v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 512,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    // MiniMax signals model-side errors in base_resp even on HTTP 200.
    if (j?.base_resp && j.base_resp.status_code !== 0) return null;
    const content = j?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null; // network / abort / parse — fall back
  } finally {
    clearTimeout(t);
  }
}

/**
 * Chat that must return JSON. Strips ```json fences, parses, and returns the typed object — or null
 * on any failure (so the caller falls back). Keep prompts explicit: "Respond with ONLY JSON ...".
 */
export async function chatJSON<T = unknown>(user: string, opts: ChatOpts = {}): Promise<T | null> {
  const raw = await chat(user, opts);
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  // Tolerate prose around the JSON by grabbing the outermost object/array.
  const match = cleaned.match(/[\{\[][\s\S]*[\}\]]/);
  try {
    return JSON.parse(match ? match[0] : cleaned) as T;
  } catch {
    return null;
  }
}
