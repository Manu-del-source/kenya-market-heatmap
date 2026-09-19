import type { NextConfig } from "next";

/**
 * Security and performance headers.
 *
 * The app is read-only and loads no third-party scripts, so a fairly tight
 * policy is safe. `connect-src 'self'` also guarantees no browser code can
 * reach an external API directly — all market data goes through our own
 * server-side routes, which is what keeps provider credentials off the client.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow the hosted preview / tunnelled dev origins used for review.
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app", "localhost"],
  // Keep the client bundle lean: the data layer is server-only.
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
