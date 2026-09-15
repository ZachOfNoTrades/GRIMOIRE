import { addManualPlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { guestResult, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { addPlayerSchema, parseBody } from "@/app/modules/damnation/lib/validation";

// POST /api/damnation/[code]/players — a player adds someone without a phone, while the host lets
// guests manage players. Body: { op_id, display_name, color_key, position?, player_id? }.
export async function POST(request: Request) {
  return withGuest(request, "POST /api/damnation/[code]/players", async (guest) => {
    const body = await parseBody(request, addPlayerSchema);
    const result = await addManualPlayer(guest.sessionId, body.op_id, body.display_name, body.color_key, body.position, body.player_id?.toLowerCase(), {
      kind: "player",
      playerId: guest.playerId,
    });
    return guestResult(result, guest.playerId);
  });
}
