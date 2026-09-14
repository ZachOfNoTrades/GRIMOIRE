import { NextResponse } from "next/server";
import { DamnationError } from "@/app/modules/damnation/lib/errors";
import { NO_STORE, withGuest } from "@/app/modules/damnation/lib/routeHandlers";
import { readSnapshotFromPool, toGuestSnapshot } from "@/app/modules/damnation/lib/snapshotFunctions";

// GET /api/play/[code]/state — the full game for a guest in the game (token required).
export async function GET(request: Request) {
  return withGuest(request, "GET /api/play/[code]/state", async (guest) => {
    const snapshot = await readSnapshotFromPool(guest.sessionId);
    if (!snapshot) throw new DamnationError(410, "This game has ended");
    return NextResponse.json(toGuestSnapshot(snapshot, guest.playerId), { headers: NO_STORE });
  });
}
