import { NextResponse } from "next/server";
import { damnationErrorResponse, DamnationError } from "@/app/modules/damnation/lib/errors";
import { joinSession, rejoinPlayer } from "@/app/modules/damnation/lib/mutationFunctions";
import { enforceRateLimit, RATE_LIMITS } from "@/app/modules/damnation/lib/rateLimit";
import { NO_STORE } from "@/app/modules/damnation/lib/routeHandlers";
import { findSessionIdByCode } from "@/app/modules/damnation/lib/sessionFunctions";
import { toGuestSnapshot } from "@/app/modules/damnation/lib/snapshotFunctions";
import { joinSchema, parseBody, requireJoinCode } from "@/app/modules/damnation/lib/validation";

// POST /api/play/[code]/join — join as a new player (joining open), or rejoin as a player after a resume.
// Returns the guest token exactly once; only its hash is stored.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    enforceRateLimit("join", request, RATE_LIMITS.join.limit, RATE_LIMITS.join.windowMs);
    const { code } = await params;
    const session = await findSessionIdByCode(requireJoinCode(code));
    if (!session) {
      enforceRateLimit("code-miss", request, RATE_LIMITS.codeMiss.limit, RATE_LIMITS.codeMiss.windowMs);
      throw new DamnationError(404, "No game with that code");
    }

    const body = await parseBody(request, joinSchema);
    const joined =
      "rejoin_player_id" in body
        ? await rejoinPlayer(session.id, body.op_id, body.rejoin_player_id.toLowerCase())
        : await joinSession(session.id, body.op_id, body.display_name, body.color_key);

    return NextResponse.json(
      { token: joined.token, snapshot: toGuestSnapshot(joined.result.snapshot, joined.playerId) },
      { status: 201, headers: NO_STORE }
    );
  } catch (error) {
    return damnationErrorResponse(error, "POST /api/play/[code]/join");
  }
}
