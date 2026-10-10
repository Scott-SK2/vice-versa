import type { NextConfig } from "next";

/**
 * En-têtes de sécurité statiques (06 § 4). La Content-Security-Policy, qui porte un nonce
 * par requête, est posée par src/proxy.ts. HSTS est posé par Caddy, qui termine TLS. La caméra
 * est autorisée pour notre seule origine : le scanner de QR intégré (participant) en a besoin.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
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
