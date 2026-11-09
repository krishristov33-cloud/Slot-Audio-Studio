import type { NextConfig } from "next";

const pages = process.env.GITHUB_PAGES === "1";
const basePath = "/Slot-Audio-Studio";

const nextConfig: NextConfig = {
  /* config options here */
  // Preview traffic arrives as 127.0.0.1, not the hostname the dev server picked.
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.cursor.sh", "*.cursor.com", "**"],
  ...(pages
    ? {}
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  ...(pages
    ? {
        output: "export" as const,
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
