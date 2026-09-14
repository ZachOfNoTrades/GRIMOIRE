import { NextResponse } from "next/server";
import { damnationErrorResponse, DamnationError } from "@/app/modules/damnation/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/app/modules/damnation/lib/rateLimit";
import { NO_STORE } from "@/app/modules/damnation/lib/routeHandlers";
import { findSessionIdByCode, getLobbyView } from "@/app/modules/damnation/lib/sessionFunctions";
import { requireJoinCode } from "@/app/modules/damnation/lib/validation";

// GET /api/play/[code]/lobby — public pre-join view: is the table open, which colors are
// taken, which seats the host has freed. No life totals; misses are rate-limited per address.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const session = await findSessionIdByCode(requireJoinCode(code));
    if (!session) {
      enforceRateLimit("code-miss", request, RATE_LIMITS.codeMiss.limit, RATE_LIMITS.codeMiss.windowMs);
      throw new DamnationError(404, "No game with that code");
    }
    return NextResponse.json(await getLobbyView(session.id), { headers: NO_STORE });
  } catch (error) {
    return damnationErrorResponse(error, "GET /api/play/[code]/lobby");
  }
}
