import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "mammoth"],
};

export default nextConfig;
