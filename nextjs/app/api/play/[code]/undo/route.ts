import { guestGameOperation } from "@/app/modules/damnation/lib/routeHandlers";

// POST /api/play/[code]/undo — reverses this guest's own most recent change.
export async function POST(request: Request) {
  return guestGameOperation(request, "undo", null);
}
