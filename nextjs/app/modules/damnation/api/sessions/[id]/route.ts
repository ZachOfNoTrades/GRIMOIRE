import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../../lib/routeHandlers";
import { requireHostedSession } from "../../../lib/sessionFunctions";

// GET /modules/damnation/api/sessions/[id] — full game state for the board.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "GET /damnation/api/sessions/[id]", async (host) =>
    NextResponse.json(await requireHostedSession(host.userId, host.sessionId), { headers: NO_STORE })
  );
}
