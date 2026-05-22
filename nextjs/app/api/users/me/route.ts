import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";

export async function GET() {
  try {
    // auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(session.user);
  } catch (error) {
    console.error("Error in GET /api/users/me:", error);
    return NextResponse.json({ error: "Failed to resolve identity" }, { status: 500 });
  }
}
