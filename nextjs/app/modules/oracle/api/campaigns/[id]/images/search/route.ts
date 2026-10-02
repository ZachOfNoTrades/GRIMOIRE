import { searchImages } from "@/app/modules/oracle/lib/imageProviders";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { imageSearchSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/images/search — look a subject up on the web.
// Body: { query }. Returns candidates to choose from; nothing is saved yet.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/images/search", async () => {
    const body = await parseBody(request, imageSearchSchema);
    return ok({ candidates: await searchImages(body.query) });
  });
}
