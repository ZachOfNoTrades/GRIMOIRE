import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createScene } from "@/app/modules/oracle/lib/sceneFunctions";
import { createSceneSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/scenes — add a scene at the end. Body: { title, summary? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/scenes", async (owner) => {
    const body = await parseBody(request, createSceneSchema);
    return ok(await createScene(owner.campaignId, body.title, body.summary), 201);
  });
}
