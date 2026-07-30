import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { renameUserApiKey, revokeUserApiKey } from "@/lib/apiKeys";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less" }, { status: 400 });
    }

    const updated = await renameUserApiKey(session.user.id!, id, name);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No api key found")) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes("UX_user_api_keys_active_name")) {
      return NextResponse.json(
        { error: "An active API key with this name already exists" },
        { status: 409 }
      );
    }
    console.error("Error in PUT /api/users/me/api-keys/[id]:", error);
    return NextResponse.json({ error: "Failed to update API key" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await revokeUserApiKey(session.user.id!, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("No api key found")) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    console.error("Error in DELETE /api/users/me/api-keys/[id]:", error);
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}
