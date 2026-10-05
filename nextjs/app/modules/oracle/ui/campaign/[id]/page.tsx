// The campaign page — a SERVER component that loads the campaign once and hands it to
// CampaignClient, which holds Prep, Table, Reference and Log as tabs on this one page.
import { PageLoadFailed, PageMissing } from "../../../components/PageStates";
import { loadCampaignPage } from "../../../lib/pageData";
import type { CampaignTab } from "../../../components/SessionBar";
import CampaignClient from "./CampaignClient";

export const dynamic = "force-dynamic";

const TABS = ["prep", "table", "reference", "log"] as const;

export default async function OracleCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const load = await loadCampaignPage(id);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  const initialTab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as CampaignTab) : "table";
  return <CampaignClient snapshot={load.data.snapshot} imageSources={load.data.imageSources} initialTab={initialTab} />;
}
