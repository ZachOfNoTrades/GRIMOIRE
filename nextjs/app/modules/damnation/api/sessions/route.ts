import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../lib/routeHandlers";
import { createSession, listSessions } from "../../lib/sessionFunctions";
import { createSessionSchema, parseBody } from "../../lib/validation";

// GET /modules/damnation/api/sessions — this host's recent games.
export async function GET(request: Request) {
  return withHost(request, null, "GET /damnation/api/sessions", async (host) =>
    NextResponse.json(await listSessions(host.userId), { headers: NO_STORE })
  );
}

// POST /modules/damnation/api/sessions — start a new game. Body: { starting_life, max_players }.
export async function POST(request: Request) {
  return withHost(request, null, "POST /damnation/api/sessions", async (host) => {
    const body = await parseBody(request, createSessionSchema);
    const snapshot = await createSession(host.userId, body.starting_life, body.max_players);
    return NextResponse.json(snapshot, { status: 201, headers: NO_STORE });
  });
}
