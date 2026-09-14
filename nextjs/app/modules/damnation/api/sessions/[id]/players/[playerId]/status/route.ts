import { hostGameOperation } from "../../../../../../lib/routeHandlers";

// PATCH /modules/damnation/api/sessions/[id]/players/[playerId]/status — host correction from the board.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  const { id, playerId } = await params;
  return hostGameOperation(request, "status", id, playerId);
}
