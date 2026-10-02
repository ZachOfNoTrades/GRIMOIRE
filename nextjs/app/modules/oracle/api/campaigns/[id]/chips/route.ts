import { dropChip, fillChips } from "@/app/modules/oracle/lib/chipFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { chipActionSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/chips — the suggestion banner.
//   { action: "fill" }            top the banner up and report whether more are being prepared
//   { action: "drop", chip_id }   an item scrolled off: drop it and bring the next one on
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/chips", async (owner) => {
    const body = await parseBody(request, chipActionSchema);
    const state = body.action === "drop" ? await dropChip(owner.campaignId, body.chip_id.toLowerCase(), owner.user) : await fillChips(owner.campaignId, owner.user);
    return ok(state);
  });
}
