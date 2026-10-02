import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { generateImage } from "@/app/modules/oracle/lib/imageProviders";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { imageGenerateSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/images/generate — have an image model draw it.
// Body: { prompt, caption }. Answers 409 until an OpenRouter key is configured.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images/generate", async (owner) => {
    const body = await parseBody(request, imageGenerateSchema);
    const campaign = await getCampaign(owner.campaignId);
    await spendGeneration(owner.user, "oracle/image");
    return ok(await generateImage(owner.campaignId, body.prompt, campaign.world, body.caption), 201);
  });
}
