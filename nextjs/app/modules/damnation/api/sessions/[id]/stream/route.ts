import { withHost } from "../../../../lib/routeHandlers";
import { requireHostedSession } from "../../../../lib/sessionFunctions";
import { openSessionStream } from "../../../../lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /modules/damnation/api/sessions/[id]/stream — live updates for the host's board.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "GET /damnation/api/sessions/[id]/stream", async (host) => {
    const initial = await requireHostedSession(host.userId, host.sessionId);
    return openSessionStream({
      request,
      sessionId: host.sessionId,
      playerId: null,
      initial,
      decorate: (snapshot) => snapshot,
    });
  });
}
