import "@/app/modules/oracle/ui/oracle.css";
import DisplayClient from "./DisplayClient";

// The player display for a shared screen: sign in on the display PC, then open the link. It is
// read-only and only ever receives what the DM has revealed (see getDisplaySnapshot).

export default async function OracleDisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DisplayClient code={code.toUpperCase()} />;
}
