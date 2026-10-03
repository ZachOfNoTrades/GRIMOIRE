import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateMapData } from "@/app/modules/oracle/lib/generationFunctions";
import { createMap } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createMapSchema, parseBody } from "@/app/modules/oracle/lib/validation";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";

// POST /modules/oracle/api/campaigns/[id]/maps — a blank map, or one generated from a
// description. Body: { name, prompt? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps", async (owner) => {
    const body = await parseBody(request, createMapSchema);
    let data = null;
    if (body.prompt) {
      await spendGeneration(owner.user, "oracle/map");
      const campaign = await getCampaign(owner.campaignId);
      data = await generateMapData(campaign.world, body.prompt, await modelFor(owner.user.id, "map"));
    }
    return ok(await createMap(owner.campaignId, body.name, data), 201);
  });
}
