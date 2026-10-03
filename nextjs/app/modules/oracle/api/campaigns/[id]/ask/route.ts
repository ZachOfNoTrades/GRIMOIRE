import { getEntity } from "@/app/modules/oracle/lib/entityFunctions";
import { askOracle, buildContext } from "@/app/modules/oracle/lib/generationFunctions";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { askSchema, parseBody } from "@/app/modules/oracle/lib/validation";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";

// POST /modules/oracle/api/campaigns/[id]/ask — the command bar's free-form question.
// Body: { query, entity_id? }. Returns a title and up to three ready-to-use answers.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/ask", async (owner) => {
    const body = await parseBody(request, askSchema);
    const subject = body.entity_id ? await getEntity(owner.campaignId, body.entity_id) : null;
    await spendGeneration(owner.user, "oracle/ask");
    const context = await buildContext(owner.campaignId);
    return ok(await askOracle(context, body.query, subject, await modelFor(owner.user.id, "ask")));
  });
}
