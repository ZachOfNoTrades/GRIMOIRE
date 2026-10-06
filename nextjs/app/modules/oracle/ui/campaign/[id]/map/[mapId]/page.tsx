// A map's page — a SERVER component that preloads the campaign, the map and the picture library
// and hands them to MapClient.
import { PageLoadFailed, PageMissing } from "../../../../../components/PageStates";
import { loadMapPage } from "../../../../../lib/pageData";
import MapClient from "./MapClient";

export const dynamic = "force-dynamic";

export default async function OracleMapPage({ params }: { params: Promise<{ id: string; mapId: string }> }) {
  const { id, mapId } = await params;
  const load = await loadMapPage(id, mapId);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <MapClient campaign={load.data.campaign} map={load.data.map} images={load.data.images} imageSources={load.data.imageSources} />;
}
