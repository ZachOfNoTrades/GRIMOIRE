import { createCampaign, listCampaigns } from "@/app/modules/oracle/lib/campaignFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createCampaignSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// GET /modules/oracle/api/campaigns — this DM's campaigns, most recently used first.
export async function GET(request: Request) {
  return withOwner(request, null, "GET /oracle/api/campaigns", async (owner) => ok(await listCampaigns(owner.userId)));
}

// POST /modules/oracle/api/campaigns — start a campaign. Body: { name }.
export async function POST(request: Request) {
  return withOwner(request, null, "POST /oracle/api/campaigns", async (owner) => {
    const body = await parseBody(request, createCampaignSchema);
    return ok(await createCampaign(owner.userId, body.name), 201);
  });
}
