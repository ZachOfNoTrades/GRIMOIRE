import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateMapData } from "@/app/modules/oracle/lib/generationFunctions";
import { DEFAULT_SCALE_LABELS } from "@/app/modules/oracle/lib/constants";
import { blankMapData } from "@/app/modules/oracle/lib/mapData";
import { createMap } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createMapSchema, parseBody } from "@/app/modules/oracle/lib/validation";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";

// POST /modules/oracle/api/campaigns/[id]/maps — a blank map, or one generated from a
// description. Body: { name, prompt?, scale? } — scale "region" (hours a square) or "local" (5 ft).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps", async (owner) => {
    const body = await parseBody(request, createMapSchema);
    let data = null;
    if (body.prompt) {
      await spendGeneration(owner.user, "oracle/map");
      const campaign = await getCampaign(owner.campaignId);
      data = await generateMapData(campaign.world, body.prompt, await modelFor(owner.user.id, "map"), body.scale);
    } else if (body.scale) {
      data = { ...blankMapData(), scale: body.scale, scale_label: DEFAULT_SCALE_LABELS[body.scale] };
    }
    return ok(await createMap(owner.campaignId, body.name, data), 201);
  });
}
