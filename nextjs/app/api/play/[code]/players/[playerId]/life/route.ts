import { guestGameOperation } from "@/app/modules/damnation/lib/routeHandlers";

// PATCH /api/play/[code]/players/[playerId]/life — any guest in the game may change any player
// in their own game; the target must belong to the token's session.
export async function PATCH(request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return guestGameOperation(request, "life", playerId);
}
