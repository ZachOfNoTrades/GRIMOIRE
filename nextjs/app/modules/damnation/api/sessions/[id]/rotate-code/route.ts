import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { rotateJoinCode } from "../../../../lib/mutationFunctions";
import { generateJoinCode } from "../../../../lib/sessionFunctions";
import { opSchema, parseBody } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/rotate-code — issue a new join code; players keep playing.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/rotate-code", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await rotateJoinCode(host.sessionId, body.op_id, generateJoinCode));
  });
}
