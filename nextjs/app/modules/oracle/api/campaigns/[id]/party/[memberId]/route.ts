import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { deletePartyMember, updatePartyMember } from "@/app/modules/oracle/lib/partyFunctions";
import { parseBody, requireUuid, updatePartyMemberSchema } from "@/app/modules/oracle/lib/validation";

// PUT /modules/oracle/api/campaigns/[id]/party/[memberId] — name, level, or map position
// (map_id + map_x + map_y to split the member off the party; all three null to rejoin).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/party/[memberId]", async (owner) => {
    const body = await parseBody(request, updatePartyMemberSchema);
    return ok(await updatePartyMember(owner.campaignId, requireUuid(memberId, "Party member"), body));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/party/[memberId]
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/party/[memberId]", async (owner) => {
    await deletePartyMember(owner.campaignId, requireUuid(memberId, "Party member"));
    return ok({ ok: true });
  });
}
