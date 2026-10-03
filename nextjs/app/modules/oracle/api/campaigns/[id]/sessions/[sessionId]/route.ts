import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { deleteSession, getSession, updateSession } from "@/app/modules/oracle/lib/sessionFunctions";
import { parseBody, requireUuid, updateSessionSchema } from "@/app/modules/oracle/lib/validation";

type Params = { params: Promise<{ id: string; sessionId: string }> };

// GET /modules/oracle/api/campaigns/[id]/sessions/[sessionId]
export async function GET(request: Request, { params }: Params) {
  const { id, sessionId } = await params;
  return withOwner(request, id, "GET /oracle/api/campaigns/[id]/sessions/[sessionId]", async (owner) =>
    ok(await getSession(owner.campaignId, requireUuid(sessionId, "Session")))
  );
}

// PUT /modules/oracle/api/campaigns/[id]/sessions/[sessionId] — title, date, notes, recap, done.
export async function PUT(request: Request, { params }: Params) {
  const { id, sessionId } = await params;
  return withOwner(request, id, "PUT /oracle/api/campaigns/[id]/sessions/[sessionId]", async (owner) => {
    const body = await parseBody(request, updateSessionSchema);
    return ok(await updateSession(owner.campaignId, requireUuid(sessionId, "Session"), body));
  });
}

// DELETE /modules/oracle/api/campaigns/[id]/sessions/[sessionId]
export async function DELETE(request: Request, { params }: Params) {
  const { id, sessionId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/sessions/[sessionId]", async (owner) => {
    await deleteSession(owner.campaignId, requireUuid(sessionId, "Session"));
    return ok({ message: "Session deleted" });
  });
}
