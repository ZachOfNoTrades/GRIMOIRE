import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { editMapData } from "@/app/modules/oracle/lib/generationFunctions";
import { getMap, replaceMapData } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { editMapSchema, parseBody, requireUuid } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/maps/[mapId]/edit — change the map in words
// ("the village was sacked"). Body: { instruction }. The previous version stays undoable.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; mapId: string }> }) {
  const { id, mapId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps/[mapId]/edit", async (owner) => {
    const body = await parseBody(request, editMapSchema);
    const map = await getMap(owner.campaignId, requireUuid(mapId, "Map"));
    await spendGeneration(owner.user, "oracle/map-edit");
    const campaign = await getCampaign(owner.campaignId);
    const data = await editMapData(campaign.world, map.data, body.instruction);
    return ok(await replaceMapData(owner.campaignId, map.id, data));
  });
}
