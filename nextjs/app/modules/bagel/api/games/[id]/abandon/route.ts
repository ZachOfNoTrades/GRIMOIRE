import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { endGame } from "../../../../lib/gameFunctions";

// POST /modules/bagel/api/games/[id]/abandon — ends an active game early without a final
// guess, so it stops being surfaced by GET /games/current. Body: { reason: "skipped" | "lost" }
// — "skipped" doesn't count toward stats, "lost" counts as a real loss. Defaults to "skipped"
// (the non-punishing option) if omitted or invalid.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = body.reason === "lost" ? "lost" : "skipped";

  try {
    const game = await endGame(session.user.id!, id, reason);
    return NextResponse.json(game);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No bagel game found")) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    console.error("Error in POST /bagel/api/games/[id]/abandon:", error);
    return NextResponse.json({ error: "Failed to abandon game" }, { status: 500 });
  }
}
