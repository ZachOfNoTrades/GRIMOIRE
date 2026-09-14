import { z } from "zod";
import { hostResult, withHost } from "../../../../lib/routeHandlers";
import { setJoinsOpen } from "../../../../lib/mutationFunctions";
import { parseBody } from "../../../../lib/validation";

const joinsSchema = z.object({ op_id: z.string().uuid(), open: z.boolean() });

// POST /modules/damnation/api/sessions/[id]/joins — close joining (start the game) or reopen it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "POST /damnation/api/sessions/[id]/joins", async (host) => {
    const body = await parseBody(request, joinsSchema);
    return hostResult(await setJoinsOpen(host.sessionId, body.op_id, body.open));
  });
}
