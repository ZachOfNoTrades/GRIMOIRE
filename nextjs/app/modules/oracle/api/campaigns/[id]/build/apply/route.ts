import { applyBuiltSession } from "@/app/modules/oracle/lib/buildFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { getTableSnapshot } from "@/app/modules/oracle/lib/snapshotFunctions";
import type { BuiltSession } from "@/app/modules/oracle/types/oracle";
import { applyBuildSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// POST /modules/oracle/api/campaigns/[id]/build/apply — save an accepted proposal: its scenes
// are added after the existing ones, and its cast is added where no entry of that name exists.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/build/apply", async (owner) => {
    const body = await parseBody(request, applyBuildSchema);
    await applyBuiltSession(owner.campaignId, body as BuiltSession);
    return ok(await getTableSnapshot(owner.campaignId, owner.userId));
  });
}
