import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getStats } from "../../lib/gameFunctions";

// GET /modules/bagel/api/stats — aggregate play stats for the current user.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const stats = await getStats(session.user.id!);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error in GET /bagel/api/stats:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
