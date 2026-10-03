import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { createSession, listSessions } from "@/app/modules/oracle/lib/sessionFunctions";
import { createSessionSchema, parseBody } from "@/app/modules/oracle/lib/validation";

// GET /modules/oracle/api/campaigns/[id]/sessions — every session, oldest first.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/sessions", async (owner) => ok(await listSessions(owner.campaignId)));
}

// POST /modules/oracle/api/campaigns/[id]/sessions — a new session. Body: { title, session_date? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withOwner(request, id, "POST /oracle/api/campaigns/[id]/sessions", async (owner) => {
    const body = await parseBody(request, createSessionSchema);
    return ok(await createSession(owner.campaignId, body.title, body.session_date), 201);
  });
}
