import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and dynamic, so Cache Components is left off for now.
  output: "standalone",
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
