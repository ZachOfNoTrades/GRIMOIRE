import { addKnowledge } from "@/app/modules/oracle/lib/entityFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import type { KnowledgeTier } from "@/app/modules/oracle/types/oracle";
import { addKnowledgeSchema, parseBody, requireUuid } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/entities/[entityId]/knowledge — reveal a fact to the
// players. Body: { fact, skill?, tier? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; entityId: string }> }) {
  const { id, entityId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/entities/[entityId]/knowledge", async (owner) => {
    const body = await parseBody(request, addKnowledgeSchema);
    const fact = await addKnowledge(owner.campaignId, requireUuid(entityId, "Entry"), body.fact, body.skill, body.tier as KnowledgeTier | null);
    return ok(fact, 201);
  });
}
