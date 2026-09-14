import { NextResponse } from "next/server";
import { removePlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { NO_STORE, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { opSchema, parseBody } from "@/app/modules/damnation/lib/validation";

// POST /api/play/[code]/leave — takes this player out of the game, along with their card.
export async function POST(request: Request) {
  return withGuest(request, "POST /api/play/[code]/leave", async (guest) => {
    const body = await parseBody(request, opSchema);
    await removePlayer(guest.sessionId, body.op_id, guest.playerId, { kind: "player", playerId: guest.playerId });
    return NextResponse.json({ left: true }, { headers: NO_STORE });
  });
}
