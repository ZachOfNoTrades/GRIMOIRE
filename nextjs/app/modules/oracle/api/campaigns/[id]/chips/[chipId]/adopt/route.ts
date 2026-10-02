import { adoptImageChip } from "@/app/modules/oracle/lib/chipFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import type { EntityKind } from "@/app/modules/oracle/types/oracle";
import { adoptChipSchema, parseBody, requireUuid } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/chips/[chipId]/adopt — turn a banner picture into a
// creature, person or place: saves the picture, writes it up to fit the scene, and puts it on the
// map beside the party. Body: { kind, name, show? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; chipId: string }> }) {
  const { id, chipId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/chips/[chipId]/adopt", async (owner) => {
    const body = await parseBody(request, adoptChipSchema);
    const result = await adoptImageChip(owner.campaignId, requireUuid(chipId, "Suggestion"), body.kind as EntityKind, body.name, body.show, owner.user);
    return ok(result, 201);
  });
}
