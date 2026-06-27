import { securityHeaders } from "./lib/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers on every route (S2): CSP, HSTS, nosniff, frame-deny, referrer + permissions policy.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [{ source: "/:path*", headers: securityHeaders(isDev) }];
  },
};
export default nextConfig;
