import { NextRequest, NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/server/env";
import { readLocalPrivateFile } from "@/lib/server/store";

export async function GET(request: NextRequest) {
  if (isProductionRuntime()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bucket = request.nextUrl.searchParams.get("bucket");
  const objectPath = request.nextUrl.searchParams.get("path");
  if (!bucket || !objectPath) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  try {
    const file = await readLocalPrivateFile(bucket, objectPath);
    return new NextResponse(file);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
