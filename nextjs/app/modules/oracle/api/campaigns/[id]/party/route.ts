import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createPartyMember, listPartyMembers } from "@/app/modules/oracle/lib/partyFunctions";
import { createPartyMemberSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// GET /modules/oracle/api/campaigns/[id]/party — the player characters, oldest first.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/party", async (owner) => ok(await listPartyMembers(owner.campaignId)));
}

// POST /modules/oracle/api/campaigns/[id]/party — a new member. Body: { name, level }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/party", async (owner) => {
    const body = await parseBody(request, createPartyMemberSchema);
    return ok(await createPartyMember(owner.campaignId, body.name, body.level), 201);
  });
}
