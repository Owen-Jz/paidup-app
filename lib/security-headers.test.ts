import { test } from "node:test";
import assert from "node:assert/strict";
import { securityHeaders, buildCsp } from "./security-headers.mjs";

test("ships the core security headers", () => {
  const map = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
  assert.equal(map["X-Content-Type-Options"], "nosniff");
  assert.equal(map["X-Frame-Options"], "DENY");
  assert.equal(map["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.ok(map["Strict-Transport-Security"].includes("max-age="));
  assert.ok(map["Content-Security-Policy"]);
  assert.ok(map["Permissions-Policy"].includes("geolocation=()"));
});

test("CSP denies framing and locks the dangerous fetch directives", () => {
  const csp = buildCsp(false);
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
});

test("production CSP excludes unsafe-eval; dev includes it for HMR only", () => {
  assert.ok(!buildCsp(false).includes("'unsafe-eval'"), "prod must not allow eval");
  assert.ok(buildCsp(true).includes("'unsafe-eval'"), "dev needs eval for react-refresh");
});

test("CSP permits the Google Fonts origins the app actually uses", () => {
  const csp = buildCsp(false);
  assert.ok(csp.includes("https://fonts.googleapis.com"));
  assert.ok(csp.includes("https://fonts.gstatic.com"));
});
