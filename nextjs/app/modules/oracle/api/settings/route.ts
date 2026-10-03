import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { getSettings, saveSettings } from "@/app/modules/oracle/lib/settingsFunctions";
import { parseBody, settingsSchema } from "@/app/modules/oracle/lib/validation";

// GET /modules/oracle/api/settings — this DM's Oracle settings.
export async function GET(request: Request) {
  return withOwner(request, null, "GET /oracle/api/settings", async (owner) => ok(await getSettings(owner.userId)));
}

// PUT /modules/oracle/api/settings — save any subset of them. Body: { chip_seconds?, banner_images?, models? }.
export async function PUT(request: Request) {
  return withOwner(request, null, "PUT /oracle/api/settings", async (owner) => {
    const body = await parseBody(request, settingsSchema);
    return ok(await saveSettings(owner.userId, body));
  });
}
