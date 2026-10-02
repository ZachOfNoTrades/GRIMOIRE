import { deleteKnowledge } from "@/app/modules/oracle/lib/entityFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

// DELETE /modules/oracle/api/campaigns/[id]/entities/[entityId]/knowledge/[knowledgeId] — take
// a revealed fact back off the player display.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; entityId: string; knowledgeId: string }> }) {
  const { id, entityId, knowledgeId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/entities/[entityId]/knowledge/[knowledgeId]", async (owner) => {
    await deleteKnowledge(owner.campaignId, requireUuid(entityId, "Entry"), requireUuid(knowledgeId, "Fact"));
    return ok({ message: "Fact removed" });
  });
}
