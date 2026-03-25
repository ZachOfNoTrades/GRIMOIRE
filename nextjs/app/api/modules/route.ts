import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { getAllModules } from "@/lib/modules";

export async function GET() {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const modules = await getAllModules();
    return NextResponse.json(modules);
  } catch (error) {
    console.error("Error in GET /api/modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules" },
      { status: 500 }
    );
  }
}
