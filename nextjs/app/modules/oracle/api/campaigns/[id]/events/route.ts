import { addEvent, listEvents } from "@/app/modules/oracle/lib/eventFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { addEventSchema, parseBody } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string }> };

// GET /modules/oracle/api/campaigns/[id]/events — the session log, newest first.
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/events", async (owner) => ok(await listEvents(owner.campaignId)));
}

// POST /modules/oracle/api/campaigns/[id]/events — add a log note. Body: { body, entity_id? }.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/events", async (owner) => {
    const body = await parseBody(request, addEventSchema);
    return ok(await addEvent(owner.campaignId, body.body, body.entity_id), 201);
  });
}
