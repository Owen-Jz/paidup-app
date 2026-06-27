// Security response headers (POLISH S2). Pure builder so it's unit-testable AND shared verbatim by
// next.config.mjs (which Node loads directly as ESM and can't import .ts). Tuned to the real app:
//   - Next.js App Router injects inline bootstrap <script> + inline style attrs -> script/style 'unsafe-inline'
//   - Google Fonts: CSS from fonts.googleapis.com, font files from fonts.gstatic.com
//   - dashboard polls same-origin /api/events; AI calls leave from the SERVER, not the browser -> connect 'self'
//   - dev only: 'unsafe-eval' + ws for HMR/react-refresh (never shipped to production)

export function buildCsp(isDev = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(isDev = false) {
  return [
    { key: "Content-Security-Policy", value: buildCsp(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }, // legacy clickjacking guard for old browsers
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // HSTS is inert over plain HTTP and enforced once served over HTTPS (the hosted MVP).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
}
