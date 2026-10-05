import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { OracleError } from "@/app/modules/oracle/lib/errors";
import { buildEntities } from "@/app/modules/oracle/lib/generationFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { getSession } from "@/app/modules/oracle/lib/sessionFunctions";
import { getSettings, modelFor } from "@/app/modules/oracle/lib/settingsFunctions";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/sessions/[sessionId]/build — read the session's saved
// notes and propose the entities it needs. Nothing is saved: the proposal goes back to the DM.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/sessions/[sessionId]/build", async (owner) => {
    const session = await getSession(owner.campaignId, requireUuid(sessionId, "Session"));
    if (session.notes.trim().length < 20) throw new OracleError(400, "Write or paste some session notes first");
    const campaign = await getCampaign(owner.campaignId);
    await spendGeneration(owner.user, "oracle/build");
    return ok(await buildEntities(campaign.world, session.notes, await modelFor(owner.user.id, "build"), (await getSettings(owner.user.id)).ai_creatures));
  });
}
