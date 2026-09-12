import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { getUserPreferences, updateUserTheme } from "@/lib/userPreferences";
import { isThemeMode, THEME_MODES } from "@/types/preferences";

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

export async function PUT(request: NextRequest) {
  try {
    // auth guard — accepts session, X-API-Key, or Bearer token
    const session = await getAuthorizedUser(request);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const theme = body?.theme;
    if (!isThemeMode(theme)) {
      return NextResponse.json(
        { error: `theme must be one of: ${THEME_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    const preferences = await updateUserTheme(session.user.id, theme);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error in PUT /api/users/me/preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
