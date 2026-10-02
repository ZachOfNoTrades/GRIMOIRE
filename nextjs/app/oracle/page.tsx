import "@/app/modules/oracle/ui/oracle.css";
import JoinClient from "./JoinClient";

// The public "enter a display code" page for the shared screen. No account needed: the code
// opens a read-only view of what the DM has revealed.
export default function OracleDisplayJoinPage() {
  return <JoinClient />;
}
