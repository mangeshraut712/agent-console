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
};

export default nextConfig;
