import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateImage } from "@/app/modules/oracle/lib/imageProviders";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { imageGenerateSchema, parseBody } from "@/app/modules/oracle/lib/validation";
import type { EntityKind } from "@/app/modules/oracle/types/oracle";

// POST /modules/oracle/api/campaigns/[id]/images/generate — have an image model draw it.
// Body: { prompt, caption, detail?, kind? }. Runs on the DM's own OpenRouter key; answers 409
// when they haven't saved one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images/generate", async (owner) => {
    const body = await parseBody(request, imageGenerateSchema);
    const campaign = await getCampaign(owner.campaignId);
    await spendGeneration(owner.user, "oracle/image");
    return ok(await generateImage(owner.user.id, owner.campaignId, body.prompt, campaign.world, body.caption, body.detail ?? "", (body.kind as EntityKind | undefined) ?? null), 201);
  });
}
