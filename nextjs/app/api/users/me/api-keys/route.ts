import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { createUserApiKey, listUserApiKeys } from "@/lib/apiKeys";

export async function GET() {
  try {
    // auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await listUserApiKeys(session.user.id!);
    return NextResponse.json(keys);
  } catch (error) {
    console.error("Error in GET /api/users/me/api-keys:", error);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less" }, { status: 400 });
    }

    const created = await createUserApiKey(session.user.id!, name);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UX_user_api_keys_active_name")) {
      return NextResponse.json(
        { error: "An active API key with this name already exists" },
        { status: 409 }
      );
    }
    console.error("Error in POST /api/users/me/api-keys:", error);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
