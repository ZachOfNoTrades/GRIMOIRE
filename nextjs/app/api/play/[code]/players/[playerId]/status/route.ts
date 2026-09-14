import { guestGameOperation } from "@/app/modules/damnation/lib/routeHandlers";

// PATCH /api/play/[code]/players/[playerId]/status — any seated guest may change any player
// in their own game; the target must belong to the token's session.
export async function PATCH(request: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return guestGameOperation(request, "status", playerId);
}
