import { deleteEvent } from "@/app/modules/oracle/lib/eventFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";
import { requireUuid } from "@/app/modules/oracle/lib/validation";

// DELETE /modules/oracle/api/campaigns/[id]/events/[eventId]
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  return withOwner(request, id, "DELETE /oracle/api/campaigns/[id]/events/[eventId]", async (owner) => {
    await deleteEvent(owner.campaignId, requireUuid(eventId, "Log entry"));
    return ok({ message: "Log entry deleted" });
  });
}
