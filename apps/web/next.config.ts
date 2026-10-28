import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: [
    "@accordiq/core",
    "@accordiq/ui",
    "@accordiq/auth",
    "@accordiq/db",
    "@accordiq/clm",
    "@accordiq/storage",
    "@accordiq/ai",
    "@accordiq/esign",
    "@accordiq/integrations",
  ],
  serverExternalPackages: ["@libsql/client", "@libsql/client/node", "libsql"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
