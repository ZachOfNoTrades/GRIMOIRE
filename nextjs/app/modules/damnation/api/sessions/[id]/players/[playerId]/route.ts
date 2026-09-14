import { hostResult, withHost } from "../../../../../lib/routeHandlers";
import { editPlayer } from "../../../../../lib/mutationFunctions";
import { editPlayerSchema, parseBody, requireUuid } from "../../../../../lib/validation";

// PATCH /modules/damnation/api/sessions/[id]/players/[playerId] — rename a player or change their
// color from the board. Body: { op_id, display_name?, color_key? }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return withHost(request, id, "PATCH /damnation/api/sessions/[id]/players/[playerId]", async (host) => {
    const body = await parseBody(request, editPlayerSchema);
    return hostResult(await editPlayer(host.sessionId, body.op_id, requireUuid(playerId, "Player"), body));
  });
}
