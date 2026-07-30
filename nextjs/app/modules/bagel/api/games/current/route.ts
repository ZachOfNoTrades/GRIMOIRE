import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getCurrentGame } from "../../../lib/gameFunctions";

// GET /modules/bagel/api/games/current — the user's most recent still-active
// game, if any. Returns null (not 404) when there isn't one, matching golem's
// /sessions/current convention: "no active game" is a normal steady state.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const game = await getCurrentGame(session.user.id!);
    return NextResponse.json(game);
  } catch (error) {
    console.error("Error in GET /bagel/api/games/current:", error);
    return NextResponse.json({ error: "Failed to load current game" }, { status: 500 });
  }
}
