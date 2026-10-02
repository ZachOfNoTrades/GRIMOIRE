import { removeChip, setChipPinned } from "@/app/modules/oracle/lib/chipFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { parseBody, requireUuid, updateChipSchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; chipId: string }> };

// PUT /modules/oracle/api/campaigns/[id]/chips/[chipId] — pin or unpin. Body: { is_pinned }.
export async function PUT(request: Request, { params }: Params) {
  const { id, chipId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/chips/[chipId]", async (owner) => {
    const body = await parseBody(request, updateChipSchema);
    await setChipPinned(owner.campaignId, requireUuid(chipId, "Suggestion"), body.is_pinned);
    return ok({ message: "Saved" });
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/chips/[chipId] — the chip was used.
export async function DELETE(request: Request, { params }: Params) {
  const { id, chipId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/chips/[chipId]", async (owner) => {
    await removeChip(owner.campaignId, requireUuid(chipId, "Suggestion"));
    return ok({ message: "Removed" });
  });
}
