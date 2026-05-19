import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "mammoth"],
  outputFileTracingIncludes: {
    "/api/interviews/start": [
      "./node_modules/pdf-parse/dist/worker/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
