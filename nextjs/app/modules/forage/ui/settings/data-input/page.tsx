"use client";

import Breadcrumbs from "@/components/Breadcrumbs";

export default function ForageDataInputPage() {

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Data Input</h1>

        {/* EMPTY STATE */}
        <div className="text-muted">No data input preferences yet.</div>
      </div>
    </div>
  );
}
