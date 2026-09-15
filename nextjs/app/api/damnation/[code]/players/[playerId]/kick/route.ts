import { removePlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { guestResult, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { opSchema, parseBody, requireUuid } from "@/app/modules/damnation/lib/validation";

// POST /api/damnation/[code]/players/[playerId]/kick — a player removes another player, while the
// host lets guests manage players (leaving the game is /leave).
export async function POST(request: Request, { params }: { params: Promise<{ code: string; playerId: string }> }) {
  const { playerId } = await params;
  return withGuest(request, "POST /api/damnation/[code]/players/[playerId]/kick", async (guest) => {
    const body = await parseBody(request, opSchema);
    const result = await removePlayer(guest.sessionId, body.op_id, requireUuid(playerId, "Player"), { kind: "player", playerId: guest.playerId });
    return guestResult(result, guest.playerId);
  });
}
