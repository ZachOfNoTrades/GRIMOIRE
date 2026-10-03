import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createPartyGroup, listPartyGroups } from "@/app/modules/oracle/lib/partyFunctions";
import { createPartyGroupSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// GET /modules/oracle/api/campaigns/[id]/party/groups — the campaign's groups.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/party/groups", async (owner) => ok(await listPartyGroups(owner.campaignId)));
}

// POST /modules/oracle/api/campaigns/[id]/party/groups — a new group. Body: { name, map_id?, map_x?, map_y? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/party/groups", async (owner) => {
    const body = await parseBody(request, createPartyGroupSchema);
    return ok(await createPartyGroup(owner.campaignId, body), 201);
  });
}
