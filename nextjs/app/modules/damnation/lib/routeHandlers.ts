import { NextResponse } from "next/server";
import type { z } from "zod";
import { userCanAccessModule } from "@/lib/moduleAccess";
import { getAuthorizedUser } from "@/lib/permissions";
import { damnationErrorResponse, DamnationError } from "./errors";
import {
  changeCommanderDamage,
  changeLife,
  changeStatus,
  type Actor,
  type MutationResult,
} from "./mutationFunctions";
import { requireGuest, requireHostedSession } from "./sessionFunctions";
import { toGuestSnapshot } from "./snapshotFunctions";
import { commanderDamageSchema, lifeSchema, parseBody, requireUuid, statusSchema } from "./validation";

// Guest and host routes share the same game operations; these wrappers do the part that
// differs — who the caller is and what they may see — so each route file stays a one-liner.

type HostContext = { userId: string; sessionId: string };
type GuestContext = { sessionId: string; playerId: string };

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function withHost(
  request: Request,
  sessionIdParam: string | null,
  context: string,
  handler: (host: HostContext) => Promise<Response>
): Promise<Response> {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Per-user module allow-list (lib/moduleAccess.ts): hosting needs access to Damnation.
    // Guests are unaffected — they have no Grimoire account at all.
    if (!(await userCanAccessModule(session.user.id, "damnation", session.user.globalAdmin))) {
      throw new DamnationError(403, "You don't have access to Damnation");
    }
    let sessionId = "";
    if (sessionIdParam !== null) {
      sessionId = requireUuid(sessionIdParam, "Game");
      // Ownership check: only the host of a session may see or control it.
      await requireHostedSession(session.user.id, sessionId);
    }
    return await handler({ userId: session.user.id, sessionId });
  } catch (error) {
    return damnationErrorResponse(error, context);
  }
}

export async function withGuest(
  request: Request,
  context: string,
  handler: (guest: GuestContext) => Promise<Response>
): Promise<Response> {
  try {
    const guest = await requireGuest(request);
    return await handler(guest);
  } catch (error) {
    return damnationErrorResponse(error, context);
  }
}

export function hostResult(result: MutationResult): Response {
  return NextResponse.json({ snapshot: result.snapshot, duplicate: result.duplicate }, { headers: NO_STORE });
}

export function guestResult(result: MutationResult, playerId: string): Response {
  return NextResponse.json(
    { snapshot: toGuestSnapshot(result.snapshot, playerId), duplicate: result.duplicate },
    { headers: NO_STORE }
  );
}

// ---------------------------------------------------------------------------------------------
// GAME OPERATIONS — identical for guests and the host apart from the actor
// ---------------------------------------------------------------------------------------------

type GameOperation = "life" | "commander-damage" | "status";

async function runGameOperation(
  request: Request,
  operation: GameOperation,
  sessionId: string,
  actor: Actor,
  targetParam: string | null
): Promise<MutationResult> {
  const targetPlayerId = targetParam === null ? "" : requireUuid(targetParam, "Player");

  switch (operation) {
    case "life": {
      const body = await parseBody(request, lifeSchema);
      return changeLife(sessionId, body.op_id, actor, targetPlayerId, body.delta);
    }
    case "commander-damage": {
      const body = await parseBody(request, commanderDamageSchema);
      return changeCommanderDamage(
        sessionId,
        body.op_id,
        actor,
        targetPlayerId,
        body.source_player_id.toLowerCase(),
        body.delta
      );
    }
    case "status": {
      const body: z.output<typeof statusSchema> = await parseBody(request, statusSchema);
      return changeStatus(sessionId, body.op_id, actor, targetPlayerId, {
        conceded: body.conceded,
        eliminated_override: body.eliminated_override,
      });
    }
    default:
      throw new DamnationError(404, "Unknown operation");
  }
}

export function guestGameOperation(request: Request, operation: GameOperation, targetParam: string | null) {
  return withGuest(request, `guest ${operation}`, async (guest) => {
    const result = await runGameOperation(
      request,
      operation,
      guest.sessionId,
      { kind: "player", playerId: guest.playerId },
      targetParam
    );
    return guestResult(result, guest.playerId);
  });
}

export function hostGameOperation(
  request: Request,
  operation: GameOperation,
  sessionIdParam: string,
  targetParam: string | null
) {
  return withHost(request, sessionIdParam, `host ${operation}`, async (host) => {
    const result = await runGameOperation(request, operation, host.sessionId, { kind: "host" }, targetParam);
    return hostResult(result);
  });
}
