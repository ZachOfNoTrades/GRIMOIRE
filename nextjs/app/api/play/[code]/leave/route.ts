import { NextResponse } from "next/server";
import { removePlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { NO_STORE, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { opSchema, parseBody } from "@/app/modules/damnation/lib/validation";

// POST /api/play/[code]/leave — gives this seat up. Life and commander damage stay on the
// seat, which becomes open for anyone with the code to claim.
export async function POST(request: Request) {
  return withGuest(request, "POST /api/play/[code]/leave", async (guest) => {
    const body = await parseBody(request, opSchema);
    await removePlayer(guest.sessionId, body.op_id, guest.playerId, "free_seat");
    return NextResponse.json({ left: true }, { headers: NO_STORE });
  });
}
