import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { createGame, getGameHistory } from "../../lib/gameFunctions";
import { DIGIT_RANGE } from "../../lib/gameLogic";

// GET /modules/bagel/api/games?page=&pageSize= — paginated game history (all statuses),
// newest first. Omit page/pageSize to get everything in one page.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined;
    const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : undefined;

    const result = await getGameHistory(session.user.id!, page, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in GET /bagel/api/games:", error);
    return NextResponse.json({ error: "Failed to load game history" }, { status: 500 });
  }
}

// POST /modules/bagel/api/games — start a new game.
// Body: { num_digits?: number } (defaults to 3, clamped to the supported range).
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const numDigits = Number(body.num_digits ?? 3);

    // VALIDATE DIFFICULTY — must be an integer within the supported range.
    if (
      !Number.isInteger(numDigits) ||
      numDigits < DIGIT_RANGE.min ||
      numDigits > DIGIT_RANGE.max
    ) {
      return NextResponse.json(
        { error: `num_digits must be an integer between ${DIGIT_RANGE.min} and ${DIGIT_RANGE.max}` },
        { status: 400 }
      );
    }

    const game = await createGame(session.user.id!, numDigits);
    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    console.error("Error in POST /bagel/api/games:", error);
    return NextResponse.json({ error: "Failed to start game" }, { status: 500 });
  }
}
