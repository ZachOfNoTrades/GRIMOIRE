import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateMapData } from "@/app/modules/oracle/lib/generationFunctions";
import { blankMapData, coerceMapData } from "@/app/modules/oracle/lib/mapData";
import { createMap } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createMapSchema, parseBody } from "@/app/modules/oracle/lib/validation";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";

// POST /modules/oracle/api/campaigns/[id]/maps — a blank map, or one generated from a
// description. Body: { name, prompt?, scale_value?, scale_unit? } — what one tile stands for;
// without it a generated map reads the scale from the description, and the default is 5 feet.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps", async (owner) => {
    const body = await parseBody(request, createMapSchema);
    const scale = body.scale_value && body.scale_unit ? { value: body.scale_value, unit: body.scale_unit } : undefined;
    let data = null;
    if (body.prompt) {
      await spendGeneration(owner.user, "oracle/map");
      const campaign = await getCampaign(owner.campaignId);
      data = await generateMapData(campaign.world, body.prompt, await modelFor(owner.user.id, "map"), scale);
    } else if (scale) {
      data = coerceMapData({ ...blankMapData(), scale_value: scale.value, scale_unit: scale.unit });
    }
    return ok(await createMap(owner.campaignId, body.name, data), 201);
  });
}
