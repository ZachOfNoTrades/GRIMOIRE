import { editPlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { guestResult, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { editPlayerSchema, parseBody, requireUuid } from "@/app/modules/damnation/lib/validation";

// PATCH /api/damnation/[code]/players/[playerId] — a player renames or recolors a player, while the
// host lets guests manage players. Body: { op_id, display_name?, color_key? }.
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string; playerId: string }> }) {
  const { playerId } = await params;
  return withGuest(request, "PATCH /api/damnation/[code]/players/[playerId]", async (guest) => {
    const body = await parseBody(request, editPlayerSchema);
    const result = await editPlayer(guest.sessionId, body.op_id, requireUuid(playerId, "Player"), body, { kind: "player", playerId: guest.playerId });
    return guestResult(result, guest.playerId);
  });
}
