import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser, isAdmin } from "@/lib/permissions";
import { getUserById } from "@/lib/users";
import { getUserModuleAccess, setUserModuleAccess } from "@/lib/moduleAccess";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // 404 if the user does not exist (throws on null single-record).
    await getUserById(id);

    const access = await getUserModuleAccess(id);
    return NextResponse.json(access);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No user found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error in GET /api/users/[id]/modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch user module access" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // moduleIds must be an array of module id strings.
    if (!Array.isArray(body.moduleIds)) {
      return NextResponse.json(
        { error: "moduleIds must be an array" },
        { status: 400 }
      );
    }

    // 404 if the user does not exist.
    await getUserById(id);

    await setUserModuleAccess(id, body.moduleIds);

    const access = await getUserModuleAccess(id);
    return NextResponse.json(access);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No user found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error in PUT /api/users/[id]/modules:", error);
    return NextResponse.json(
      { error: "Failed to update user module access" },
      { status: 500 }
    );
  }
}
