import { NextRequest, NextResponse } from "next/server";
import { createInviteSchema } from "@/lib/schemas";
import { adminUnauthorized, isAdminRequest } from "@/lib/server/admin";
import {
  generateInviteToken,
  hashInviteToken,
} from "@/lib/server/security";
import { createInvite } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return adminUnauthorized();

  const body = await request.json();
  const input = createInviteSchema.parse(body);
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
