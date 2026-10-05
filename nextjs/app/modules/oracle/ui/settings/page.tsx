// Oracle settings — a SERVER component that preloads the DM's settings.
import { PageLoadFailed, PageMissing } from "../../components/PageStates";
import { loadSettingsPage } from "../../lib/pageData";
import { requireOwnedCampaign } from "../../lib/campaignFunctions";
import { getAuthorizedUser } from "@/lib/permissions";
import { headers } from "next/headers";
import SettingsClient from "./SettingsClient";

// Per-user data read from the request: never prerender this page at build time.
export const dynamic = "force-dynamic";

// Settings are the DM's own, not a campaign's, so this page sits outside the campaign. When it is
// opened from one, `?campaign=` names it so the trail can lead back there in one step.
async function cameFrom(id: string | undefined): Promise<{ label: string; href: string } | null> {
  if (!id) return null;
  try {
    const auth = await getAuthorizedUser(new Request("http://internal", { headers: await headers() }));
    if (!auth) return null;
    const campaign = await requireOwnedCampaign(auth.user.id, id);
    return { label: campaign.name, href: `/modules/oracle/ui/campaign/${campaign.id}` };
  } catch {
    return null;
  }
}

export default async function OracleSettingsPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const [load, { campaign }] = await Promise.all([loadSettingsPage(), searchParams]);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <SettingsClient settings={load.data} cameFrom={await cameFrom(campaign)} />;
}
