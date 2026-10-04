import { resetMap } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; mapId: string }> };

// POST /modules/oracle/api/campaigns/[id]/maps/[mapId]/reset — fog back to what the party sees
// now, and entries on the map hidden again. Returns the map.
export async function POST(request: Request, { params }: Params) {
  const { id, mapId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps/[mapId]/reset", async (owner) => {
    return ok(await resetMap(owner.campaignId, requireUuid(mapId, "Map")));
  });
}
