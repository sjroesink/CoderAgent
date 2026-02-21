import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: "../../dist/web",
  serverExternalPackages: [
    "better-sqlite3",
    "socket.io",
    "@github/copilot-sdk",
    "@anthropic-ai/claude-agent-sdk",
  ],
};

export default nextConfig;
