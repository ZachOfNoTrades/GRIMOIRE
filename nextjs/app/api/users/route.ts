import { NextResponse } from "next/server";
import { getAuthorizedSession, isAdmin } from "@/lib/permissions";
import { getAllUsers } from "@/lib/users";

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

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error in GET /api/users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
