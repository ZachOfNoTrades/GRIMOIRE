import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { changeGameSetup } from "../../../../lib/mutationFunctions";
import { parseBody, setupSchema } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/setup — change starting life and/or the player count
// while joining is open. Body: { op_id, starting_life?, max_players? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/setup", async (host) => {
    const body = await parseBody(request, setupSchema);
    return hostResult(await changeGameSetup(host.sessionId, body.op_id, body));
  });
}
