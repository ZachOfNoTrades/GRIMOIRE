import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../../../lib/routeHandlers";
import { saveCommanderDamage } from "../../../../lib/sessionFunctions";
import { commanderDamageToggleSchema, parseBody } from "../../../../lib/validation";

// PUT /modules/damnation/api/sessions/[id]/commander-damage — switch commander damage for this game.
// Body: { enabled }.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "PUT /damnation/api/sessions/[id]/commander-damage", async (host) => {
    const body = await parseBody(request, commanderDamageToggleSchema);
    return NextResponse.json({ snapshot: await saveCommanderDamage(host.sessionId, body.enabled) }, { headers: NO_STORE });
  });
}
