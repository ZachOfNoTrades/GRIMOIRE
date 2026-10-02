// The Log tab — a SERVER component that preloads the campaign and hands it to LogClient.
import { PageLoadFailed, PageMissing } from "../../../../components/PageStates";
import { loadCampaignPage } from "../../../../lib/pageData";
import LogClient from "./LogClient";

export const dynamic = "force-dynamic";

export default async function OracleLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await loadCampaignPage(id);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <LogClient snapshot={load.data.snapshot} imageSources={load.data.imageSources} />;
}
