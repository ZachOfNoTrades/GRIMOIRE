"use client";

import { SettingsBackLink } from "@/components/settings/SettingsList";

export default function ForageDataInputPage() {

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Settings" fallback="/modules/forage/ui/settings" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Data Input</h1>

        {/* EMPTY STATE */}
        <div className="text-muted">No data input preferences yet.</div>
      </div>
    </div>
  );
}
