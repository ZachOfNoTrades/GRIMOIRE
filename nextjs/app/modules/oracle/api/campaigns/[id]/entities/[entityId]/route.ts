import { deleteEntity, updateEntity, type EntityPatch } from "@/app/modules/oracle/lib/entityFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { parseBody, requireUuid, updateEntitySchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; entityId: string }> };

// PUT /modules/oracle/api/campaigns/[id]/entities/[entityId] — any of its fields, its place on
// the map, or its picture.
export async function PUT(request: Request, { params }: Params) {
  const { id, entityId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/entities/[entityId]", async (owner) => {
    const body = await parseBody(request, updateEntitySchema);
    return ok(await updateEntity(owner.campaignId, requireUuid(entityId, "Entry"), body as EntityPatch));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/entities/[entityId]
export async function DELETE(request: Request, { params }: Params) {
  const { id, entityId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/entities/[entityId]", async (owner) => {
    await deleteEntity(owner.campaignId, requireUuid(entityId, "Entry"));
    return ok({ message: "Entry deleted" });
  });
}
