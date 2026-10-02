import { setDisplay } from "@/app/modules/oracle/lib/campaignFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { displaySchema, parseBody } from "@/app/modules/oracle/lib/validation";

// PUT /modules/oracle/api/campaigns/[id]/display — what the player display's panel shows, and
// whether the display is blanked. Body: { panel_kind?, panel_id?, blank? }.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/display", async (owner) => {
    const body = await parseBody(request, displaySchema);
    return ok(await setDisplay(owner.campaignId, body));
  });
}
