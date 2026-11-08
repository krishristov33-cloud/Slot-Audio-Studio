import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Preview traffic arrives as 127.0.0.1, not the hostname the dev server picked.
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.cursor.sh", "*.cursor.com", "**"],
  cacheComponents: true,
  partialPrefetching: true,
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
