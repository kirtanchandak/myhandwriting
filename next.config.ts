import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
