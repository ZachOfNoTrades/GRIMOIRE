import "@/app/modules/oracle/ui/oracle.css";
import JoinClient from "./JoinClient";

// The "enter a display code" page for the shared screen. The code opens a read-only view of what
// the DM has revealed, for any signed-in account.
export default function OracleDisplayJoinPage() {
  return <JoinClient />;
}
