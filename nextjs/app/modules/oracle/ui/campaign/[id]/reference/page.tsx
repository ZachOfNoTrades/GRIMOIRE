// The Reference tab — a SERVER component that preloads the campaign and hands it to ReferenceClient.
import { PageLoadFailed, PageMissing } from "../../../../components/PageStates";
import { loadCampaignPage } from "../../../../lib/pageData";
import ReferenceClient from "./ReferenceClient";

export const dynamic = "force-dynamic";

export default async function OracleReferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const load = await loadCampaignPage(id);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <ReferenceClient snapshot={load.data.snapshot} imageSources={load.data.imageSources} />;
}
