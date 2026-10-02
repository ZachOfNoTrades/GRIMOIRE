// Oracle settings — a SERVER component that preloads the DM's settings.
import { PageLoadFailed, PageMissing } from "../../components/PageStates";
import { loadSettingsPage } from "../../lib/pageData";
import SettingsClient from "./SettingsClient";

// Per-user data read from the request: never prerender this page at build time.
export const dynamic = "force-dynamic";

export default async function OracleSettingsPage() {
  const load = await loadSettingsPage();
  if (load.status === "missing") return <PageMissing />;
  if (load.status === "error") return <PageLoadFailed />;
  return <SettingsClient settings={load.data} />;
}
