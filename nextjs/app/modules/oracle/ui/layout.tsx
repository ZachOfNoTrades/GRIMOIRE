import "./oracle.css";
import BodyClass from "./BodyClass";

export default function OracleLayout({ children }: { children: React.ReactNode }) {
  /* Pass-through layout — each Oracle page renders its own header. It exists to load the
     module's page-scoped stylesheet once for every page under /modules/oracle/ui, and to mark
     the body so modals (which portal out of the page) take the module's type scale. */
  return (
    <>
      <BodyClass name="orc-body" />
      {children}
    </>
  );
}
