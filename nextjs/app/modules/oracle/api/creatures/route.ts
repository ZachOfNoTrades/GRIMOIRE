import { searchCreatures } from "@/app/modules/oracle/lib/creatureFunctions";
import { ok, withOwner } from "@/app/modules/oracle/lib/routeHandlers";

export const runtime = "nodejs";

// GET /modules/oracle/api/creatures?q= — the creature library: the bundled SRD alongside the DM's
// own. Used by the Search tab when adding something to a campaign.
export async function GET(request: Request) {
  // No campaign: the library is the DMs, not a campaigns.
  return withOwner(request, null, "GET /oracle/api/creatures", async (owner) => {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return ok({ creatures: await searchCreatures(owner.userId, query) });
  });
}
