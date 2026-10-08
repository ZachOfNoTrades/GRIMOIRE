import "@/app/modules/oracle/ui/oracle.css";
import { loadDisplayPage } from "@/app/modules/oracle/lib/pageData";
import DisplayClient from "./DisplayClient";

export const dynamic = "force-dynamic";

// The player display for a shared screen: sign in on the display PC, then open the link. It is
// read-only and only ever receives what the DM has revealed (see getDisplaySnapshot). The first
// snapshot is loaded here so the page paints complete.

export default async function OracleDisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const upper = code.toUpperCase();
  return <DisplayClient code={upper} initial={await loadDisplayPage(upper)} />;
}
