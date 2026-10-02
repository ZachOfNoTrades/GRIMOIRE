import "./oracle.css";

export default function OracleLayout({ children }: { children: React.ReactNode }) {
  /* Pass-through layout — each Oracle page renders its own header. It exists to load the
     module's page-scoped stylesheet once for every page under /modules/oracle/ui. */
  return <>{children}</>;
}
