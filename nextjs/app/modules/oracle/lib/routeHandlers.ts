import { NextResponse } from "next/server";
import { checkGenerationLimit, logGeneration } from "@/lib/generationLimit";
import { userCanAccessModule } from "@/lib/moduleAccess";
import { getAuthorizedUser, type AuthUser } from "@/lib/permissions";
import { requireOwnedCampaign } from "./campaignFunctions";
import { MODULE_SLUG } from "./constants";
import { OracleError, oracleErrorResponse } from "./errors";
import { requireUuid } from "./validation";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

type OwnerContext = { user: AuthUser; userId: string; campaignId: string };

// Every DM route goes through this: it resolves the caller, checks module access, and — when the
// route names a campaign — confirms the caller owns it. A campaign id that belongs to someone
// else is a 404, the same as one that does not exist.
export async function withOwner(
  request: Request,
  campaignIdParam: string | null,
  context: string,
  handler: (owner: OwnerContext) => Promise<Response>
): Promise<Response> {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (!(await userCanAccessModule(session.user.id, MODULE_SLUG, session.user.globalAdmin))) {
      throw new OracleError(403, "You don't have access to Oracle");
    }
    let campaignId = "";
    if (campaignIdParam !== null) {
      campaignId = requireUuid(campaignIdParam, "Campaign");
      await requireOwnedCampaign(session.user.id, campaignId);
    }
    return await handler({ user: session.user, userId: session.user.id, campaignId });
  } catch (error) {
    return oracleErrorResponse(error, context);
  }
}

// Generation endpoints share the app-wide per-user generation limit (0 = unlimited).
export async function spendGeneration(user: AuthUser, endpoint: string): Promise<void> {
  const limit = await checkGenerationLimit(user.id, user.generationLimit);
  if (!limit.allowed) {
    throw new OracleError(429, `Generation limit reached (${limit.count}/${limit.limit}). Try again later.`);
  }
  await logGeneration(user.id, endpoint);
}

export function ok(data: unknown, status = 200): Response {
  return NextResponse.json(data, { status, headers: NO_STORE });
}
