import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../../../lib/routeHandlers";
import { saveGuestPlayerManagement } from "../../../../lib/sessionFunctions";
import { commanderDamageToggleSchema, parseBody } from "../../../../lib/validation";

// PUT /modules/damnation/api/sessions/[id]/guest-management — let players on their phones add,
// edit, move and remove players in this game, or stop them. Body: { enabled }.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "PUT /damnation/api/sessions/[id]/guest-management", async (host) => {
    const body = await parseBody(request, commanderDamageToggleSchema);
    return NextResponse.json({ snapshot: await saveGuestPlayerManagement(host.sessionId, body.enabled) }, { headers: NO_STORE });
  });
}
