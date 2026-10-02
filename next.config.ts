import type { NextConfig } from "next";

const mediaOrigin = (() => {
  try {
    return new URL(process.env.MEDIA_BASE_URL ?? "/media").origin;
  } catch {
    return null; // URL relative : même origine
  }
})();
const mediaSrc = mediaOrigin && mediaOrigin !== "null" ? ` ${mediaOrigin}` : "";

/** En-têtes de sécurité (06 § 4). HSTS est posé par Caddy, qui termine TLS. */
const csp = [
  "default-src 'self'",
  // Next.js injecte des scripts inline pour l'hydratation ; sans nonce, 'unsafe-inline' est requis.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${mediaSrc}`,
  `media-src 'self' blob:${mediaSrc}`,
  `connect-src 'self'${mediaSrc}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
