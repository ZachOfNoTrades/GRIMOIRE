import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getGame } from "../../../lib/gameFunctions";

// GET /modules/bagel/api/games/[id] — fetch a game's current state + history.
// Used to resume an in-progress game. The secret is withheld until the game ends.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const game = await getGame(session.user.id!, id);
    return NextResponse.json(game);
  } catch (error) {
    // Lib throws on a missing single record → surface as 404.
    if (error instanceof Error && error.message.startsWith("No bagel game found")) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    console.error("Error in GET /bagel/api/games/[id]:", error);
    return NextResponse.json({ error: "Failed to load game" }, { status: 500 });
  }
}
