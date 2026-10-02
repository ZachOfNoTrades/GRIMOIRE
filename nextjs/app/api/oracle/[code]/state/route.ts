import { NextResponse } from "next/server";
import { oracleErrorResponse } from "@/app/modules/oracle/lib/errors";
import { NO_STORE } from "@/app/modules/oracle/lib/routeHandlers";
import { findCampaignIdByCode, getDisplaySnapshot, getDisplayVersion } from "@/app/modules/oracle/lib/snapshotFunctions";
import { requireDisplayCode } from "@/app/modules/oracle/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/oracle/[code]/state?v=<version> — what the player display shows. Public on purpose
// (middleware.ts excludes /api/oracle/): the display PC has no account. The snapshot is built
// for players — it never contains DM notes, stats, or anything outside the party's vision.
// When `v` matches the current version the answer is just { unchanged: true }, so the display
// can poll every second without re-reading the whole map.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const displayCode = requireDisplayCode(code);
    const versionParam = new URL(request.url).searchParams.get("v");
    const known = versionParam !== null && /^\d{1,9}$/.test(versionParam) ? Number(versionParam) : null;
    if (known !== null) {
      const version = await getDisplayVersion(displayCode);
      if (version === known) return NextResponse.json({ unchanged: true, version }, { headers: NO_STORE });
    }
    const campaignId = await findCampaignIdByCode(displayCode);
    return NextResponse.json(await getDisplaySnapshot(campaignId), { headers: NO_STORE });
  } catch (error) {
    return oracleErrorResponse(error, "GET /api/oracle/[code]/state");
  }
}
