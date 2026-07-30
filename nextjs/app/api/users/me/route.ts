import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(session.user);
  } catch (error) {
    console.error("Error in GET /api/users/me:", error);
    return NextResponse.json({ error: "Failed to resolve identity" }, { status: 500 });
  }
}
