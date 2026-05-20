import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createInviteSchema } from "@/lib/schemas";
import { adminUnauthorized, isAdminRequest } from "@/lib/server/admin";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/server/security";
import { createInvite } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return adminUnauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  let input;
  try {
    input = createInviteSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid invite payload",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    throw error;
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const invite = await createInvite({
    tokenHash,
    roleTitle: input.roleTitle,
    level: input.level,
    jobDescription: input.jobDescription,
    expiresAt,
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin;

  return NextResponse.json({
    invite,
    inviteUrl: `${appUrl}/i/${token}`,
  });
}
