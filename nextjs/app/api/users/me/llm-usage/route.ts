import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getUsageReport, isUsageRange } from "@/lib/llm/usage";

// THE CALLER'S OWN MODEL-CALL LOG, aggregated. ?range=7d|30d|all (default 30d).

export async function GET(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const range = request.nextUrl.searchParams.get("range") ?? "30d";
    if (!isUsageRange(range)) {
      return NextResponse.json({ error: "range must be 7d, 30d or all" }, { status: 400 });
    }

    return NextResponse.json(await getUsageReport(session.user.id, range));
  } catch (error) {
    console.error("Error in GET /api/users/me/llm-usage:", error);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}
