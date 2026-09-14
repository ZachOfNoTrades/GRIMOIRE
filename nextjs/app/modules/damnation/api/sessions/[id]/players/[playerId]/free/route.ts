import { hostResult, withHost } from "../../../../../../lib/routeHandlers";
import { removePlayer } from "../../../../../../lib/mutationFunctions";
import { opSchema, parseBody, requireUuid } from "../../../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players/[playerId]/free — sign a player's phone out so someone can claim the seat (keeps life and damage).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players/[playerId]/free", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await removePlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), "free_seat"));
  });
}
