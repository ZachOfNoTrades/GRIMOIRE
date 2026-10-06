"use client";

import { useRouter } from "next/navigation";
import { Settings, SunMoon, ShieldCheck, Cpu, BarChart3, KeyRound } from "lucide-react";
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

  const aiRows: SettingsRowItem[] = [
    {
      icon: Cpu,
      label: "Models",
      onClick: () => router.push("/settings/ui/llm"),
    },
    {
      icon: BarChart3,
      label: "Usage",
      onClick: () => router.push("/settings/ui/usage"),
    },
  ];

  const accountRows: SettingsRowItem[] = [
    {
      icon: KeyRound,
      label: "API keys",
      onClick: () => router.push("/settings/ui/api-keys"),
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

        {/* AI SECTION — per-task model backend + the usage log */}
        <h2 className="settings-section-title">AI</h2>
        <SettingsGroup rows={aiRows} />

        {/* ACCOUNT SECTION */}
        <h2 className="settings-section-title">Account</h2>
        <SettingsGroup rows={accountRows} />

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
