import { resetMap, type MapResetScope } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; mapId: string }> };

// POST /modules/oracle/api/campaigns/[id]/maps/[mapId]/reset — fog back to what the party sees
// now. `?scope=fog` stops there; without it the entries revealed on the map are hidden again
// too. Returns the map.
export async function POST(request: Request, { params }: Params) {
  const { id, mapId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps/[mapId]/reset", async (owner) => {
    const scope: MapResetScope = new URL(request.url).searchParams.get("scope") === "fog" ? "fog" : "all";
    return ok(await resetMap(owner.campaignId, requireUuid(mapId, "Map"), scope));
  });
}
