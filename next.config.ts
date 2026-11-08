import type { NextConfig } from "next";

const securityHeaders = [
  // .app is HSTS-preloaded; keep the header too so every browser pins HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  images: {
    // Character renders and item icons served by Blizzard's API (permitted under its API terms).
    remotePatterns: [
      { protocol: "https", hostname: "render.worldofwarcraft.com" },
      { protocol: "https", hostname: "*.api.blizzard.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // www → apex
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.dragonwarriors.app" }],
        destination: "https://dragonwarriors.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default config;
