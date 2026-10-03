// A session's page — a SERVER component that preloads the campaign, the session and the cast
// and hands them to SessionClient.
import { PageLoadFailed, PageMissing } from "../../../../../components/PageStates";
import { loadSessionPage } from "../../../../../lib/pageData";
import SessionClient from "./SessionClient";

export const dynamic = "force-dynamic";

export default async function OracleSessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  const load = await loadSessionPage(id, sessionId);
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <SessionClient campaign={load.data.campaign} session={load.data.session} entities={load.data.entities} />;
}
