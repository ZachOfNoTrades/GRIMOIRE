import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../lib/routeHandlers";
import { getSettings, saveSettings } from "../../lib/sessionFunctions";
import { parseBody, settingsSchema } from "../../lib/validation";

// GET /modules/damnation/api/settings — the host's defaults for new games.
export async function GET(request: Request) {
  return withHost(request, null, "GET /damnation/api/settings", async (host) =>
    NextResponse.json(await getSettings(host.userId), { headers: NO_STORE })
  );
}

// PUT /modules/damnation/api/settings — save any subset of them. Games already created keep their
// own values (switched on the board).
export async function PUT(request: Request) {
  return withHost(request, null, "PUT /damnation/api/settings", async (host) => {
    const body = await parseBody(request, settingsSchema);
    return NextResponse.json(await saveSettings(host.userId, body), { headers: NO_STORE });
  });
}
