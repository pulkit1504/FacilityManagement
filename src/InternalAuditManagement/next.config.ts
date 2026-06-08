import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost"
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  poweredByHeader: false
};

export default nextConfig;
