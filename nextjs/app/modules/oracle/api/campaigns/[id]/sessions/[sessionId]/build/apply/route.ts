import { applyBuiltEntities } from "@/app/modules/oracle/lib/buildFunctions";
import { listEntities } from "@/app/modules/oracle/lib/entityFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { getSession } from "@/app/modules/oracle/lib/sessionFunctions";
import { applyBuildSchema, parseBody, requireUuid } from "@/app/modules/oracle/lib/validation";
import type { BuiltEntities } from "@/app/modules/oracle/types/oracle";

// POST /modules/oracle/api/campaigns/[id]/sessions/[sessionId]/build/apply — save an accepted
// proposal: its entities is added where no entry of that name exists. Returns the full entities.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/sessions/[sessionId]/build/apply", async (owner) => {
    await getSession(owner.campaignId, requireUuid(sessionId, "Session"));
    const body = await parseBody(request, applyBuildSchema);
    await applyBuiltEntities(owner.campaignId, body as BuiltEntities);
    return ok(await listEntities(owner.campaignId));
  });
}
