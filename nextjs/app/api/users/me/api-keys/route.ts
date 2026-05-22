import { NextResponse } from "next/server";
import { getAuthorizedConnection } from "@/lib/permissions";
import { listUserApiKeys } from "@/lib/apiKeys";

export async function GET() {
  try {
    // auth guard
    const session = await getAuthorizedConnection();
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
