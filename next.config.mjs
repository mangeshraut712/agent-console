const isGitHubPages = process.env.GITHUB_PAGES === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? "export" : "standalone",
  images: {
    unoptimized: isGitHubPages,
  },
  ...(isGitHubPages
    ? {
        basePath: "/agent-console",
        assetPrefix: "/agent-console/",
        trailingSlash: true,
      }
    : {}),
  async headers() {
    if (isGitHubPages) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
