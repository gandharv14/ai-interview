import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next config", () => {
  it("includes PDF worker files in the interview start route trace", () => {
    expect(nextConfig.outputFileTracingIncludes).toMatchObject({
      "/api/interviews/start": expect.arrayContaining([
        "./node_modules/pdf-parse/dist/worker/**/*",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      ]),
    });
  });
});
