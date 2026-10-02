import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { OracleError } from "@/app/modules/oracle/lib/errors";
import { buildSession } from "@/app/modules/oracle/lib/generationFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";

// POST /modules/oracle/api/campaigns/[id]/build — read the saved draft and propose scenes and a
// cast. Nothing is saved: the proposal goes back to the DM, who applies it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/build", async (owner) => {
    const campaign = await getCampaign(owner.campaignId);
    if (campaign.draft.trim().length < 20) throw new OracleError(400, "Write or paste some session notes first");
    await spendGeneration(owner.user, "oracle/build");
    return ok(await buildSession(campaign.world, campaign.draft));
  });
}
