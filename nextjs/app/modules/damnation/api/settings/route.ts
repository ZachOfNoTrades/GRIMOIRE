import { NextResponse } from "next/server";
import { getMainConnection } from "@/lib/db";
import { broadcastSnapshot } from "../../lib/sessionBus";
import { NO_STORE, withHost } from "../../lib/routeHandlers";
import { getSettings, saveSettings } from "../../lib/sessionFunctions";
import { readSnapshot } from "../../lib/snapshotFunctions";
import { normalizeWikiTemplate, parseBody, settingsSchema } from "../../lib/validation";

// GET /modules/damnation/api/settings — the host's wiki search settings.
export async function GET(request: Request) {
  return withHost(request, null, "GET /damnation/api/settings", async (host) =>
    NextResponse.json(await getSettings(host.userId), { headers: NO_STORE })
  );
}

// PUT /modules/damnation/api/settings — save them, then push the change to the host's live games
// so phones pick up a replacement wiki straight away.
export async function PUT(request: Request) {
  return withHost(request, null, "PUT /damnation/api/settings", async (host) => {
    const body = await parseBody(request, settingsSchema);
    const saved = await saveSettings(host.userId, normalizeWikiTemplate(body.wiki_search_template), body.wiki_embed);

    const pool = await getMainConnection();
    const live = await pool
      .request()
      .input("hostUserId", host.userId)
      .query<{ id: string }>(`SELECT id FROM damnation_sessions WHERE host_user_id = @hostUserId AND status <> 'finished'`);
    for (const row of live.recordset) {
      const snapshot = await readSnapshot(pool, row.id);
      if (snapshot) broadcastSnapshot(snapshot.id, snapshot);
    }

    return NextResponse.json(saved, { headers: NO_STORE });
  });
}
