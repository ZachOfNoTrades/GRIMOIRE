import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { addManualPlayer } from "../../../../lib/mutationFunctions";
import { addPlayerSchema, parseBody } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/players — the host adds a player who has no phone.
// Body: { op_id, display_name, color_key, position?, player_id? }. Same rules as a guest join.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/players", async (host) => {
    const body = await parseBody(request, addPlayerSchema);
    return hostResult(await addManualPlayer(host.sessionId, body.op_id, body.display_name, body.color_key, body.position, body.player_id?.toLowerCase()));
  });
}
