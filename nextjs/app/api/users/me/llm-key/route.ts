import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { deleteOpenRouterKey, getOpenRouterKeyStatus, saveOpenRouterKey } from "@/lib/llm/userKeys";
import { LlmBackendError } from "@/lib/llm/types";

// THE CALLER'S OWN OPENROUTER KEY. Browser-session only (like /api/users/me/api-keys):
// a key is managed from Settings, never through an API key or an MCP token. No
// handler here ever returns the key — GET and PUT answer with the status shape
// { configured, last4, label, ts_updated } and nothing else.

export async function GET() {
  try {
    // auth guard — session only
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await getOpenRouterKeyStatus(session.user.id!));
  } catch (error) {
    console.error("Error in GET /api/users/me/llm-key:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load key status" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // auth guard — session only
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const key = typeof body?.key === "string" ? body.key : "";
    if (!key.trim()) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const status = await saveOpenRouterKey(session.user.id!, key);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof LlmBackendError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    // Message only — never the request body.
    console.error("Error in PUT /api/users/me/llm-key:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    // auth guard — session only
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await deleteOpenRouterKey(session.user.id!);
    return NextResponse.json({ configured: false, last4: null, label: null, ts_updated: null });
  } catch (error) {
    console.error("Error in DELETE /api/users/me/llm-key:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to remove key" }, { status: 500 });
  }
}
