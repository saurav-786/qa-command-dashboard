import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Silence multi-lockfile warning when nested under ~/qa-automation-bot
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
