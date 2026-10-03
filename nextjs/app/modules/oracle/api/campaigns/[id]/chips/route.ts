import { fillChips, recycleChip } from "@/app/modules/oracle/lib/chipFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { chipActionSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/chips — the suggestion banner.
//   { action: "fill" }               top the pool up (to its ceiling) and report whether more are being prepared
//   { action: "recycle", chip_id }   an item scrolled off: send it to the back of the pool
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/chips", async (owner) => {
    const body = await parseBody(request, chipActionSchema);
    const state = body.action === "recycle" ? await recycleChip(owner.campaignId, body.chip_id.toLowerCase(), owner.user) : await fillChips(owner.campaignId, owner.user);
    return ok(state);
  });
}
