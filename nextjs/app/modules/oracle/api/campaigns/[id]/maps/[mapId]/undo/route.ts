import { undoMapData } from "@/app/modules/oracle/lib/mapFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/maps/[mapId]/undo — put back the map as it was before
// the last change.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; mapId: string }> }) {
  const { id, mapId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/maps/[mapId]/undo", async (owner) =>
    ok(await undoMapData(owner.campaignId, requireUuid(mapId, "Map")))
  );
}
