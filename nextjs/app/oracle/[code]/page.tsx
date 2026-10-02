import "@/app/modules/oracle/ui/oracle.css";
import DisplayClient from "./DisplayClient";

// The public player display for a shared screen. middleware.ts excludes /oracle/ from the sign-in
// gate on purpose — the display PC has no account. It is read-only and only ever receives what
// the DM has revealed (see getDisplaySnapshot).

export default async function OracleDisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DisplayClient code={code.toUpperCase()} />;
}
