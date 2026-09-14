import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { finishSession } from "../../../../lib/mutationFunctions";
import { opSchema, parseBody } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/end — end the game; phones are signed out of it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/end", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await finishSession(host.sessionId, body.op_id));
  });
}
