"use client";

import { useRouter } from "next/navigation";
import { Settings, SunMoon, ShieldCheck } from "lucide-react";
import PermissionGuardClient from "@/components/PermissionGuardClient";
import { SettingsGroup, type SettingsRowItem } from "@/components/settings/SettingsList";

// App-wide, per-user settings hub. The global admin console that used to live
// at this URL moved to /settings/ui/admin (admin-only); this page is for
// everyone and holds the signed-in user's own preferences.
export default function UserSettingsPage() {
  const router = useRouter();

  const appearanceRows: SettingsRowItem[] = [
    {
      icon: SunMoon,
      label: "Theme",
      onClick: () => router.push("/settings/ui/theme"),
    },
  ];

  const adminRows: SettingsRowItem[] = [
    {
      icon: ShieldCheck,
      label: "Admin settings",
      onClick: () => router.push("/settings/ui/admin"),
    },
  ];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title"><Settings className="w-6 h-6" /> Settings</h1>

        {/* APPEARANCE SECTION */}
        <h2 className="settings-section-title">Appearance</h2>
        <SettingsGroup rows={appearanceRows} />

        {/* ADMINISTRATION SECTION (admin only) */}
        <PermissionGuardClient>
          <>
            <h2 className="settings-section-title">Administration</h2>
            <SettingsGroup rows={adminRows} />
          </>
        </PermissionGuardClient>
      </div>
    </div>
  );
}
