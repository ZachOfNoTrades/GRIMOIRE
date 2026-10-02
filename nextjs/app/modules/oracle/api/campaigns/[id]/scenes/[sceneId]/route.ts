import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { deleteScene, updateScene } from "@/app/modules/oracle/lib/sceneFunctions";
import { parseBody, requireUuid, updateSceneSchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; sceneId: string }> };

// PUT /modules/oracle/api/campaigns/[id]/scenes/[sceneId] — title, summary, done, order.
export async function PUT(request: Request, { params }: Params) {
  const { id, sceneId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/scenes/[sceneId]", async (owner) => {
    const body = await parseBody(request, updateSceneSchema);
    return ok(await updateScene(owner.campaignId, requireUuid(sceneId, "Scene"), body));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/scenes/[sceneId]
export async function DELETE(request: Request, { params }: Params) {
  const { id, sceneId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/scenes/[sceneId]", async (owner) => {
    await deleteScene(owner.campaignId, requireUuid(sceneId, "Scene"));
    return ok({ message: "Scene deleted" });
  });
}
