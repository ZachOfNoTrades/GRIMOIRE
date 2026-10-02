import { createEntity, type EntityInput } from "@/app/modules/oracle/lib/entityFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createEntitySchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/entities — add a creature, person or place.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/entities", async (owner) => {
    const body = await parseBody(request, createEntitySchema);
    return ok(await createEntity(owner.campaignId, body as EntityInput), 201);
  });
}
