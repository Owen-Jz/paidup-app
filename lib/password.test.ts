import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.ts";

test("hash → verify round-trips; wrong password fails", () => {
  const stored = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("Tr0ub4dor&3", stored), false);
  assert.equal(verifyPassword("", stored), false);
});

test("salts are per-user: the same password hashes differently every time", () => {
  const a = hashPassword("hunter22");
  const b = hashPassword("hunter22");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("hunter22", a), true);
  assert.equal(verifyPassword("hunter22", b), true);
});

test("malformed stored hashes are rejected without throwing", () => {
  for (const bad of ["", "plain", "bcrypt:x:y", "scrypt:", "scrypt:abc", "scrypt:zz:not-hex"]) {
    assert.equal(verifyPassword("anything", bad), false, `should reject: ${JSON.stringify(bad)}`);
  }
});
