import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { resumeSession } from "../../../../lib/mutationFunctions";
import { generateJoinCode } from "../../../../lib/sessionFunctions";
import { opSchema, parseBody } from "../../../../lib/validation";

// POST /modules/damnation/api/sessions/[id]/resume — reopen a finished game with its totals and a new code.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/resume", async (host) => {
    const body = await parseBody(request, opSchema);
    return hostResult(await resumeSession(host.sessionId, body.op_id, host.userId, generateJoinCode));
  });
}
