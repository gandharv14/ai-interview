import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/server/env";
import {
  readLocalPrivateFile,
  recordingBucketName,
  resumeBucketName,
} from "@/lib/server/store";

const ALLOWED_BUCKETS = new Set([resumeBucketName(), recordingBucketName()]);

function isPathSafe(objectPath: string) {
  if (!objectPath) return false;
  if (objectPath.startsWith("/") || objectPath.startsWith("\\")) return false;
  if (objectPath.includes("\0")) return false;
  const normalized = path.normalize(objectPath);
  if (normalized.startsWith("..")) return false;
  if (normalized.split(/[/\\]/).some((segment) => segment === "..")) {
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  if (isProductionRuntime()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bucket = request.nextUrl.searchParams.get("bucket");
  const objectPath = request.nextUrl.searchParams.get("path");
  if (!bucket || !objectPath) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (!isPathSafe(objectPath)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const file = await readLocalPrivateFile(bucket, objectPath);
    return new NextResponse(file);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
