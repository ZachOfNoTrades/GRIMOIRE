// The Oracle home page — a SERVER component that preloads the DM's campaigns.
import { PageLoadFailed, PageMissing } from "../../components/PageStates";
import { loadHomePage } from "../../lib/pageData";
import HomeClient from "./HomeClient";

// Per-user data read from the request: never prerender this page at build time.
export const dynamic = "force-dynamic";

export default async function OracleHomePage() {
  const load = await loadHomePage();
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <HomeClient campaigns={load.data} />;
}
