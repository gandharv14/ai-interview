import fs from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {
  const storeDir = path.join(process.cwd(), ".local-data");
  const storePath = path.join(storeDir, "e2e-store.json");
  const uploadsDir = path.join(storeDir, "uploads");
  await fs.rm(storePath, { force: true });
  await fs.rm(uploadsDir, { recursive: true, force: true });
}
