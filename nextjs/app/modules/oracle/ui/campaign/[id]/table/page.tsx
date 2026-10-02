// The Table tab — a SERVER component that preloads everything the first paint reads (campaign,
// scenes, maps, cast, pictures, banner, log, settings) and hands it to TableClient.
import { PageLoadFailed, PageMissing } from "../../../../components/PageStates";
import { loadCampaignPage } from "../../../../lib/pageData";
import TableClient from "./TableClient";

export const dynamic = "force-dynamic";

export default async function OracleTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await loadCampaignPage(id);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <TableClient snapshot={load.data.snapshot} imageSources={load.data.imageSources} />;
}
