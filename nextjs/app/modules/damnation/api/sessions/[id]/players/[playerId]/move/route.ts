import { hostResult, withHost } from "../../../../../../lib/routeHandlers";
import { movePlayer } from "../../../../../../lib/mutationFunctions";
import { moveSchema, parseBody, requireUuid } from "../../../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players/[playerId]/move — swap two players' places in
// board order (a drag onto another card). Body: { op_id, with_player_id }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players/[playerId]/move", async (host) => {
    const body = await parseBody(request, moveSchema);
    return hostResult(await movePlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), body.with_player_id.toLowerCase()));
  });
}
