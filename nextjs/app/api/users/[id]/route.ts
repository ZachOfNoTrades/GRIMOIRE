import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession, isAdmin } from "@/lib/permissions";
import { getUserById, updateUser, deleteUser, getGlobalAdminCount } from "@/lib/users";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const user = await getUserById(id);
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No user found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error in GET /api/users/[id]:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Prevent removing admin from the last admin
    if (body.global_admin === false) {
      const targetUser = await getUserById(id);
      if (targetUser.global_admin) {
        const adminCount = await getGlobalAdminCount();
        if (adminCount <= 1) {
          return NextResponse.json(
            { error: "Cannot remove admin status. At least one admin must exist." },
            { status: 400 }
          );
        }
      }
    }

    const updatedUser = await updateUser(id, body);
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No user found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error in PUT /api/users/[id]:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists
    const user = await getUserById(id);

    // Prevent users from deleting themselves
    if (session.user.email === user.email) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    // Prevent deleting the last global admin
    if (user.global_admin) {
      const adminCount = await getGlobalAdminCount();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin. At least one admin must exist." },
          { status: 400 }
        );
      }
    }

    await deleteUser(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No user found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error in DELETE /api/users/[id]:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
