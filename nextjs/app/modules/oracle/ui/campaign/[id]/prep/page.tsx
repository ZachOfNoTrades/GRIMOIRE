// The Prep tab — a SERVER component that preloads the campaign and hands it to PrepClient.
import { PageLoadFailed, PageMissing } from "../../../../components/PageStates";
import { loadCampaignPage } from "../../../../lib/pageData";
import PrepClient from "./PrepClient";

export const dynamic = "force-dynamic";

export default async function OraclePrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await loadCampaignPage(id);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <PrepClient snapshot={load.data.snapshot} imageSources={load.data.imageSources} />;
}
