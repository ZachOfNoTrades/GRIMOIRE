import { hostResult, withHost } from "../../../../../../lib/routeHandlers";
import { removePlayer } from "../../../../../../lib/mutationFunctions";
import { opSchema, parseBody, requireUuid } from "../../../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players/[playerId]/kick — remove a player; their seat, color and name are released.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players/[playerId]/kick", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await removePlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), "kick"));
  });
}
