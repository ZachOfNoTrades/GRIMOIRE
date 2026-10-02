import { importSearchImage } from "@/app/modules/oracle/lib/imageProviders";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { imageImportSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/images/import — keep a search result in the library.
// Body: { source_id, caption }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images/import", async (owner) => {
    const body = await parseBody(request, imageImportSchema);
    return ok(await importSearchImage(owner.campaignId, body.source_id, body.caption), 201);
  });
}
