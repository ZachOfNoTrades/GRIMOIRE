import ContentNotFound from "@/components/ContentNotFound";

// What an Oracle page shows instead of its content when the server preload did not succeed.
export function PageLoadFailed() {
  return (
    // LOAD FAILED
    <div className="page">
      <div className="page-container">

        {/* ALERT */}
        <div className="alert alert-red">
          <p className="alert-title">Couldn&apos;t load this page</p>
          <p className="alert-text">The server didn&apos;t answer. Reload to try again.</p>
        </div>
      </div>
    </div>
  );
}

export function PageMissing() {
  return <ContentNotFound />;
}
