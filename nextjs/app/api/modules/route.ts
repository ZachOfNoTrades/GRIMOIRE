import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getModulesForUser } from "@/lib/moduleAccess";

export async function GET(request: Request) {
  try {
    // Auth guard
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Only the modules this user may access (admins + unconfigured users get all).
    const modules = await getModulesForUser(
      session.user.id,
      session.user.globalAdmin
    );
    return NextResponse.json(modules);
  } catch (error) {
    console.error("Error in GET /api/modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules" },
      { status: 500 }
    );
  }
}
