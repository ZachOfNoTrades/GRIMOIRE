import { hostResult, withHost } from "../../../../../../lib/routeHandlers";
import { movePlayer } from "../../../../../../lib/mutationFunctions";
import { moveSchema, parseBody, requireUuid } from "../../../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players/[playerId]/move — swap a player with their
// neighbor in board order. Body: { op_id, direction: "earlier" | "later" }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players/[playerId]/move", async (host) => {
    const body = await parseBody(request, moveSchema);
    return hostResult(await movePlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), body.direction));
  });
}
