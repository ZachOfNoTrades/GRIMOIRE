import { hostResult, withHost } from "../../../../../../lib/routeHandlers";
import { movePlayer } from "../../../../../../lib/mutationFunctions";
import { moveSchema, parseBody, requireUuid } from "../../../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players/[playerId]/move — a drag on the board: swap two
// players' spots, or move a player into an open spot. Body: { op_id, with_player_id } or
// { op_id, to_position }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players/[playerId]/move", async (host) => {
    const body = await parseBody(request, moveSchema);
    const target = "with_player_id" in body ? { withPlayerId: body.with_player_id.toLowerCase() } : { toPosition: body.to_position };
    return hostResult(await movePlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), target));
  });
}
