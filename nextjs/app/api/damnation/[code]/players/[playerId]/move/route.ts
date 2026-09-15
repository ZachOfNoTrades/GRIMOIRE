import { movePlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { guestResult, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { moveSchema, parseBody, requireUuid } from "@/app/modules/damnation/lib/validation";

// POST /api/damnation/[code]/players/[playerId]/move — a player swaps two players' spots or moves a
// player into an open spot, while the host lets guests manage players. Body: { op_id,
// with_player_id } or { op_id, to_position }.
export async function POST(request: Request, { params }: { params: Promise<{ code: string; playerId: string }> }) {
  const { playerId } = await params;
  return withGuest(request, "POST /api/damnation/[code]/players/[playerId]/move", async (guest) => {
    const body = await parseBody(request, moveSchema);
    const target = "with_player_id" in body ? { withPlayerId: body.with_player_id.toLowerCase() } : { toPosition: body.to_position };
    const result = await movePlayer(guest.sessionId, body.op_id, requireUuid(playerId, "Player"), target, { kind: "player", playerId: guest.playerId });
    return guestResult(result, guest.playerId);
  });
}
