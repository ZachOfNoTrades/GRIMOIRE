import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { resetGame } from "../../../../lib/mutationFunctions";
import { opSchema, parseBody } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/reset — start the game over with the same table: every
// player back to the starting life, commander damage cleared, nobody out. Body: { op_id }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/reset", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await resetGame(host.sessionId, body.op_id));
  });
}
