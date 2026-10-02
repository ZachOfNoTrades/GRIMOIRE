import { coerceMapData } from "@/app/modules/oracle/lib/mapData";
import { deleteMap, replaceMapData, updateMap } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { parseBody, requireUuid, updateMapSchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; mapId: string }> };

// PUT /modules/oracle/api/campaigns/[id]/maps/[mapId] — name, party position, vision, explored
// area, or the whole feature list (`data`, which goes on the undo stack).
export async function PUT(request: Request, { params }: Params) {
  const { id, mapId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/maps/[mapId]", async (owner) => {
    const body = await parseBody(request, updateMapSchema);
    const map = requireUuid(mapId, "Map");
    const { data, ...rest } = body;
    let result = Object.keys(rest).length > 0 ? await updateMap(owner.campaignId, map, rest) : null;
    if (data !== undefined) result = await replaceMapData(owner.campaignId, map, coerceMapData(data));
    return ok(result);
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/maps/[mapId]
export async function DELETE(request: Request, { params }: Params) {
  const { id, mapId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/maps/[mapId]", async (owner) => {
    await deleteMap(owner.campaignId, requireUuid(mapId, "Map"));
    return ok({ message: "Map deleted" });
  });
}
