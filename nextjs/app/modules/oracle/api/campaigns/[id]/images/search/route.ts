import { getCampaign } from "@/app/modules/oracle/lib/campaignFunctions";
import { searchImagesWithFallback, searchTermsFor } from "@/app/modules/oracle/lib/imageProviders";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";
import { imageSearchSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/images/search — look a subject up on the web.
// Body: { query }. The subject is first turned into search words (a short model call), then
// looked up. Returns the words used and candidates to choose from; nothing is saved yet.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images/search", async (owner) => {
    const body = await parseBody(request, imageSearchSchema);
    const [campaign, model] = await Promise.all([getCampaign(owner.campaignId), modelFor(owner.user.id, "picture")]);
    const terms = await searchTermsFor(body.query, campaign.world, model, body.detail ?? "");
    return ok(await searchImagesWithFallback(terms, body.query));
  });
}
