import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../../lib/routeHandlers";
import { deleteSession, requireHostedSession } from "../../../lib/sessionFunctions";

// GET /modules/damnation/api/sessions/[id] — full game state for the board.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "GET /damnation/api/sessions/[id]", async (host) =>
    NextResponse.json(await requireHostedSession(host.userId, host.sessionId), { headers: NO_STORE })
  );
}

// DELETE /modules/damnation/api/sessions/[id] — delete the game, its players and its history.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "DELETE /damnation/api/sessions/[id]", async (host) => {
    await deleteSession(host.sessionId);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  });
}
