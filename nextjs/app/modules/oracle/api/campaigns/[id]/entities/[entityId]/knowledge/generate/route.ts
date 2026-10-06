import { getEntity } from "@/app/modules/oracle/lib/entityFunctions";
import { buildContext, generateFact } from "@/app/modules/oracle/lib/generationFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import type { KnowledgeTier } from "@/app/modules/oracle/types/oracle";
import { generateKnowledgeSchema, parseBody, requireUuid } from "@/app/modules/oracle/lib/validation";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";

// POST /modules/oracle/api/campaigns/[id]/entities/[entityId]/knowledge/generate — draft the
// fact a knowledge check earned. Body: { skill, tier }. Nothing is saved or shown to the players
// until the DM reveals it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; entityId: string }> }) {
  const { id, entityId } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/entities/[entityId]/knowledge/generate", async (owner) => {
    const body = await parseBody(request, generateKnowledgeSchema);
    const entity = await getEntity(owner.campaignId, requireUuid(entityId, "Entry"));
    await spendGeneration(owner.user, "oracle/fact");
    const context = await buildContext(owner.campaignId, owner.user.id);
    return ok({ fact: await generateFact(owner.user.id, context, entity, body.skill, body.tier as KnowledgeTier, await modelFor(owner.user.id, "fact")) });
  });
}
