import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { listModelsForAllTasks, validateModel } from "@/lib/llm/catalog";
import { isLlmTaskId } from "@/lib/llm/tasks";
import { isLlmBackend } from "@/lib/llm/types";

// MODEL CATALOG for the settings page.
//   GET  ?backend=claude|openrouter          → { [task]: { recommended, models[] } }
//   POST { backend, task, model }            → { ok, name?, reason? }
// OpenRouter's list is public and cached; nothing here uses the caller's key.

export async function GET(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backend = request.nextUrl.searchParams.get("backend");
    if (!isLlmBackend(backend)) {
      return NextResponse.json({ error: "backend must be claude or openrouter" }, { status: 400 });
    }

    return NextResponse.json(await listModelsForAllTasks(backend, session.user.id));
  } catch (error) {
    console.error("Error in GET /api/llm/models:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Couldn't load the model list" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!isLlmBackend(body?.backend) || !isLlmTaskId(body?.task) || typeof body?.model !== "string") {
      return NextResponse.json({ error: "backend, task and model are required" }, { status: 400 });
    }

    return NextResponse.json(await validateModel(body.backend, body.task, body.model, session.user.id));
  } catch (error) {
    console.error("Error in POST /api/llm/models:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Couldn't check the model" }, { status: 502 });
  }
}
