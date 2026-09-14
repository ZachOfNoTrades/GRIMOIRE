import { NextResponse } from "next/server";
import { NO_STORE, withHost } from "../../../../lib/routeHandlers";
import { saveBoardLayout } from "../../../../lib/sessionFunctions";
import { layoutSchema, parseBody } from "../../../../lib/validation";

// PUT /modules/damnation/api/sessions/[id]/layout — pick how cards are arranged on the board.
// Body: { board_layout: <key from lib/boardLayouts.ts> | null } (null = automatic grid).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHost(request, id, "PUT /damnation/api/sessions/[id]/layout", async (host) => {
    const body = await parseBody(request, layoutSchema);
    const snapshot = await saveBoardLayout(host.sessionId, body.board_layout);
    return NextResponse.json({ snapshot }, { headers: NO_STORE });
  });
}
