import { buildContext, outlineEntity } from "@/app/modules/oracle/lib/generationFunctions";
import { findChallengeRow, statBlockFromChallenge } from "@/app/modules/oracle/lib/reference";
import { ok, spendGeneration, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { modelFor } from "@/app/modules/oracle/lib/settingsFunctions";
import type { EntityKind } from "@/app/modules/oracle/types/oracle";
import { draftEntitySchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/entities/draft — write up a new entry from a name, a
// short idea ("a shopkeeper in Vincha"), or both, so it fits the campaign and the live session.
// Body: { kind, name?, idea? }. Nothing is saved; the DM reviews it in the entry editor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/entities/draft", async (owner) => {
    const body = await parseBody(request, draftEntitySchema);
    const kind = body.kind as EntityKind;
    await spendGeneration(owner.user, "oracle/outline");
    const context = await buildContext(owner.campaignId, owner.user.id);
    const outline = await outlineEntity(context, kind, body.name, await modelFor(owner.user.id, "outline"), body.idea);
    const row = kind === "creature" ? findChallengeRow(outline.cr ?? "1/4") : null;
    return ok({
      name: outline.name,
      details: outline.details,
      dm_notes: outline.dm_notes,
      attitude: kind === "item" ? "neutral" : outline.attitude,
      source: outline.source,
      stats: row ? statBlockFromChallenge(row) : null,
    });
  });
}
