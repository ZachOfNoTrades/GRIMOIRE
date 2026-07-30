import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getDashboardBadges } from "@/lib/dashboardBadges";

// Read-only "what needs attention" summary for the homepage module cards, keyed by module slug.
// Deliberately side-effect free — painting a badge must never advance any module's state (notably
// forage's weekly check-in, which a recompute would mark as done).
export async function GET(request: Request) {
  try {
    // Auth guard
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const badges = await getDashboardBadges(session.user.id!);
    return NextResponse.json(badges);
  } catch (error) {
    console.error("Error in GET /api/dashboard/badges:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard badges" },
      { status: 500 }
    );
  }
}
