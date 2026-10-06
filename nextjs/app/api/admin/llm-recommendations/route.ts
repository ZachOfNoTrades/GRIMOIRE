import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { validateModel } from "@/lib/llm/catalog";
import { coerceRecommendedModels, getRecommendedModels, setRecommendedModels } from "@/lib/llm/recommendations";
import { taskDef, type LlmTaskId } from "@/lib/llm/tasks";
import type { LlmBackend } from "@/lib/llm/types";

// RECOMMENDED MODELS — global admin only, browser session only. PUT replaces the
// whole map; every pinned id is checked against its backend's catalog and the
// task's needs first.

async function adminSession() {
  const session = await getAuthorizedSession();
  return session?.user.globalAdmin ? session : null;
}

export async function GET() {
  try {
    if (!(await adminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await getRecommendedModels());
  } catch (error) {
    console.error("Error in GET /api/admin/llm-recommendations:", error);
    return NextResponse.json({ error: "Failed to load recommended models" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await adminSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = coerceRecommendedModels(await request.json().catch(() => null));
    for (const [task, entry] of Object.entries(body)) {
      for (const [backend, model] of Object.entries(entry ?? {})) {
        const check = await validateModel(backend as LlmBackend, task as LlmTaskId, model, session.user.id!);
        if (!check.ok) {
          return NextResponse.json({ error: `${taskDef(task as LlmTaskId).label}: ${check.reason}`, task, backend }, { status: 400 });
        }
      }
    }

    return NextResponse.json(await setRecommendedModels(body));
  } catch (error) {
    console.error("Error in PUT /api/admin/llm-recommendations:", error);
    return NextResponse.json({ error: "Failed to save recommended models" }, { status: 500 });
  }
}
