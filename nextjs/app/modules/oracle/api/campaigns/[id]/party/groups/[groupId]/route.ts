import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { deletePartyGroup, updatePartyGroup } from "@/app/modules/oracle/lib/partyFunctions";
import { parseBody, requireUuid, updatePartyGroupSchema } from "@/app/modules/oracle/lib/validation";

// PUT /modules/oracle/api/campaigns/[id]/party/groups/[groupId] — name or position.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/party/groups/[groupId]", async (owner) => {
    const body = await parseBody(request, updatePartyGroupSchema);
    return ok(await updatePartyGroup(owner.campaignId, requireUuid(groupId, "Group"), body));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/party/groups/[groupId] — disband; its members rejoin the party.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/party/groups/[groupId]", async (owner) => {
    await deletePartyGroup(owner.campaignId, requireUuid(groupId, "Group"));
    return ok({ ok: true });
  });
}
