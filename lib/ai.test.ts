import { test } from "node:test";
import assert from "node:assert/strict";

// Set the key BEFORE importing ai.ts (it captures process.env at module load), so these tests are
// deterministic regardless of the ambient environment. Then mock global fetch to drive every branch.
// This is the core safety proof of the AI moat: the client must return null (→ deterministic fallback)
// on every failure mode, and must never throw.
process.env.MINIMAX_API_KEY = "test-key-deterministic";
const { chat, chatJSON, aiConfigured } = await import("./ai.ts");

const origFetch = globalThis.fetch;
const setFetch = (impl: unknown) => { (globalThis as { fetch: unknown }).fetch = impl; };
const reset = () => { (globalThis as { fetch: unknown }).fetch = origFetch; };

const ok = (content: string) =>
  ({ ok: true, json: async () => ({ choices: [{ message: { content } }], base_resp: { status_code: 0 } }) });

test("aiConfigured() is true when a key is set", () => {
  assert.equal(aiConfigured(), true);
});

test("chat returns trimmed content on success", async () => {
  setFetch(async () => ok("  hello world  "));
  try { assert.equal(await chat("hi"), "hello world"); } finally { reset(); }
});

test("chatJSON strips ```json fences and parses", async () => {
  setFetch(async () => ok("```json\n{\"invoiceId\":\"INV-1\"}\n```"));
  try { assert.deepEqual(await chatJSON("x"), { invoiceId: "INV-1" }); } finally { reset(); }
});

test("chatJSON extracts JSON embedded in prose", async () => {
  setFetch(async () => ok("Sure: {\"a\":1} — done"));
  try { assert.deepEqual(await chatJSON("x"), { a: 1 }); } finally { reset(); }
});

test("chat returns null on HTTP error (non-ok)", async () => {
  setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  try { assert.equal(await chat("x"), null); } finally { reset(); }
});

test("chat returns null when MiniMax base_resp signals an error (rate limit etc.)", async () => {
  setFetch(async () => ({ ok: true, json: async () => ({ base_resp: { status_code: 1002, status_msg: "rate limited" }, choices: [] }) }));
  try { assert.equal(await chat("x"), null); } finally { reset(); }
});

test("chat returns null on a network throw (never propagates)", async () => {
  setFetch(async () => { throw new Error("ECONNRESET"); });
  try { assert.equal(await chat("x"), null); } finally { reset(); }
});

test("chat returns null on empty/whitespace content", async () => {
  setFetch(async () => ok("   "));
  try { assert.equal(await chat("x"), null); } finally { reset(); }
});

test("chatJSON returns null on unparseable content", async () => {
  setFetch(async () => ok("not json at all"));
  try { assert.equal(await chatJSON("x"), null); } finally { reset(); }
});
