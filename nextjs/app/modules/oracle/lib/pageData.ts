import { headers } from "next/headers";
import { userCanAccessModule } from "@/lib/moduleAccess";
import { getAuthorizedUser, type AuthUser } from "@/lib/permissions";
import type { CampaignSummary, OracleSettings, TableSnapshot } from "../types/oracle";
import { listCampaigns, requireOwnedCampaign } from "./campaignFunctions";
import { MODULE_SLUG } from "./constants";
import { OracleError } from "./errors";
import { listImageSources, type ImageSourceInfo } from "./imageProviders";
import { getSettings } from "./settingsFunctions";
import { getTableSnapshot } from "./snapshotFunctions";

// SERVER PRELOADS — each Oracle page is a server component that loads everything its first paint
// reads here and hands it to its client component, so a page appears once, complete.
//
// "missing" covers a campaign that does not exist, one that belongs to someone else, and a
// caller without access to the module: the page shows the same not-found state for all three.
// "error" is a failed load (database unreachable); the page says so instead of going blank.

export type PageLoad<T> = { status: "ok"; data: T } | { status: "missing" } | { status: "error" };

async function resolveUser(): Promise<AuthUser | null> {
  const auth = await getAuthorizedUser(new Request("http://internal", { headers: await headers() }));
  if (!auth) return null;
  if (!(await userCanAccessModule(auth.user.id, MODULE_SLUG, auth.user.globalAdmin))) return null;
  return auth.user;
}

async function guarded<T>(load: (user: AuthUser) => Promise<T>): Promise<PageLoad<T>> {
  try {
    const user = await resolveUser();
    if (!user) return { status: "missing" };
    return { status: "ok", data: await load(user) };
  } catch (error) {
    // Next signals "this route reads the request" by throwing from headers() during the build's
    // static pass. That one must propagate, or the page is prerendered once as a failure.
    if ((error as { digest?: string } | null)?.digest === "DYNAMIC_SERVER_USAGE") throw error;
    if (error instanceof OracleError && (error.status === 404 || error.status === 403)) return { status: "missing" };
    console.error("Oracle page preload failed:", error);
    return { status: "error" };
  }
}

export interface CampaignPageData {
  snapshot: TableSnapshot;
  imageSources: ImageSourceInfo[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadCampaignPage(campaignIdParam: string): Promise<PageLoad<CampaignPageData>> {
  return guarded(async (user) => {
    if (!UUID_PATTERN.test(campaignIdParam)) throw new OracleError(404, "Campaign not found");
    const campaignId = campaignIdParam.toLowerCase();
    await requireOwnedCampaign(user.id, campaignId);
    return { snapshot: await getTableSnapshot(campaignId, user.id), imageSources: listImageSources() };
  });
}

export function loadHomePage(): Promise<PageLoad<CampaignSummary[]>> {
  return guarded((user) => listCampaigns(user.id));
}

export function loadSettingsPage(): Promise<PageLoad<OracleSettings>> {
  return guarded((user) => getSettings(user.id));
}
