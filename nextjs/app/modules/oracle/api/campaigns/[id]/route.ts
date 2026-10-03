import { deleteCampaign, updateCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { getTableSnapshot } from "@/app/modules/oracle/lib/snapshotFunctions";
import { parseBody, updateCampaignSchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string }> };

// GET /modules/oracle/api/campaigns/[id] — everything the DM's pages read.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]", async (owner) => ok(await getTableSnapshot(owner.campaignId, owner.userId)));
}

// PUT /modules/oracle/api/campaigns/[id] — name, world notes, live session, active map.
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]", async (owner) => {
    const body = await parseBody(request, updateCampaignSchema);
    // A session change keeps the ideas pool: later batches are written for the new session, and
    // refilling a whole pool per session would spend far more of the Claude allowance.
    return ok(await updateCampaign(owner.userId, owner.campaignId, body));
  });
}

// DELETE /modules/oracle/api/campaigns/[id] — the campaign and everything in it.
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]", async (owner) => {
    await deleteCampaign(owner.campaignId);
    return ok({ message: "Campaign deleted" });
  });
}
