import { hostGameOperation } from "../../../../lib/routeHandlers";

// POST /modules/damnation/api/sessions/[id]/undo — reverses the latest change at the table,
// whoever made it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return hostGameOperation(request, "undo", id, null);
}
