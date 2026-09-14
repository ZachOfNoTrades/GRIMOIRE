import { DamnationError } from "@/app/modules/damnation/lib/errors";
import { withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { readSnapshotFromPool, toGuestSnapshot } from "@/app/modules/damnation/lib/snapshotFunctions";
import { openSessionStream } from "@/app/modules/damnation/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/damnation/[code]/stream — live updates for a guest in the game. A code alone never opens a
// stream; the token is required, and streams are capped per player and per process.
export async function GET(request: Request) {
  return withGuest(request, "GET /api/damnation/[code]/stream", async (guest) => {
    const initial = await readSnapshotFromPool(guest.sessionId);
    if (!initial) throw new DamnationError(410, "This game has ended");
    return openSessionStream({
      request,
      sessionId: guest.sessionId,
      playerId: guest.playerId,
      initial,
      decorate: (snapshot) => toGuestSnapshot(snapshot, guest.playerId),
    });
  });
}
