import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getUserPreferences, updateLlmTaskPrefs, updateUserTheme } from "@/lib/userPreferences";
import { coerceLlmTaskPrefs, isThemeMode, THEME_MODES } from "@/types/preferences";
import { validateModel } from "@/lib/llm/catalog";
import { taskDef, type LlmTaskId } from "@/lib/llm/tasks";

// APP-WIDE PREFERENCES FOR THE CALLER. `getAuthorizedUser` (not the
// session-only guard) so an API key / Bearer token can read and set them too —
// these are the caller's own rows, never another user's.

export async function GET(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getUserPreferences(session.user.id);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error in GET /api/users/me/preferences:", error);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

// PUT accepts `theme`, `llm_tasks`, or both. `llm_tasks` is a partial map that is
// merged over the stored one — send only the tasks that changed.
export async function PUT(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const hasTheme = body?.theme !== undefined;
    const hasTasks = body?.llm_tasks !== undefined;
    if (!hasTheme && !hasTasks) {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }
    if (hasTheme && !isThemeMode(body.theme)) {
      return NextResponse.json(
        { error: `theme must be one of: ${THEME_MODES.join(", ")}` },
        { status: 400 }
      );
    }
    if (hasTasks && (!body.llm_tasks || typeof body.llm_tasks !== "object")) {
      return NextResponse.json({ error: "llm_tasks must be an object" }, { status: 400 });
    }

    // A typed-in model id must exist for its backend and fit the task — a bad id
    // would otherwise only surface as a failed generation later.
    const taskPrefs = hasTasks ? coerceLlmTaskPrefs(body.llm_tasks) : {};
    for (const [task, config] of Object.entries(taskPrefs)) {
      if (!config?.model) continue;
      const check = await validateModel(config.backend, task as LlmTaskId, config.model);
      if (!check.ok) {
        return NextResponse.json({ error: `${taskDef(task as LlmTaskId).label}: ${check.reason}`, task }, { status: 400 });
      }
    }

    let preferences = await getUserPreferences(session.user.id);
    if (hasTheme) preferences = await updateUserTheme(session.user.id, body.theme);
    if (hasTasks) preferences = await updateLlmTaskPrefs(session.user.id, taskPrefs);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error in PUT /api/users/me/preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
