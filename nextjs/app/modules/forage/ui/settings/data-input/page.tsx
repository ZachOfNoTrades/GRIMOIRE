"use client";

import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import { SettingsBackLink } from "@/components/settings/SettingsList";

export default function ForageDataInputPage() {
  const router = useRouter();
  const goBack = useGoBack();

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Settings" onClick={() => goBack("/modules/forage/ui/settings")} />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">Data Input</h1>

        {/* EMPTY STATE */}
        <div className="text-muted">No data input preferences yet.</div>
      </div>
    </div>
  );
}
