import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateWorld } from "@/app/modules/oracle/lib/generationFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { listSessions } from "@/app/modules/oracle/lib/sessionFunctions";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";
import { generateWorldSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/world/generate — write world notes from the campaign
// name, whatever the DM has typed so far and the latest session's notes. Body: { seed? }. Nothing
// is saved: the text goes back to the Prep tab, where the DM edits it and it saves like typed text.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/world/generate", async (owner) => {
    const body = await parseBody(request, generateWorldSchema);
    const [campaign, sessions] = await Promise.all([getCampaign(owner.campaignId), listSessions(owner.campaignId)]);
    const latestNotes = [...sessions].reverse().find((session) => session.notes.trim())?.notes ?? "";
    await spendGeneration(owner.user, "oracle/world");
    return ok({ world: await generateWorld(owner.user.id, campaign.name, body.seed, latestNotes, await modelFor(owner.user.id, "world")) });
  });
}
