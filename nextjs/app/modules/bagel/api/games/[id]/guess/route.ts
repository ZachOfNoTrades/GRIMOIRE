import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { submitGuess } from "../../../../lib/gameFunctions";

// POST /modules/bagel/api/games/[id]/guess — submit a guess.
// Body: { guess: string }. Scoring is authoritative server-side; the response
// carries the updated game (incl. the revealed secret once finished).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const guess = String(body.guess ?? "");

    const result = await submitGuess(session.user.id!, id, guess);

    // Validation rejection (bad length / non-digits / repeats / finished game).
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    // Lib throws on a missing single record → surface as 404.
    if (error instanceof Error && error.message.startsWith("No bagel game found")) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    console.error("Error in POST /bagel/api/games/[id]/guess:", error);
    return NextResponse.json({ error: "Failed to submit guess" }, { status: 500 });
  }
}
