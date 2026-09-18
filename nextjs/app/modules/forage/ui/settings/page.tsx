"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ruler, Apple, Keyboard, Upload, Settings, Bell, BellRing, Clock } from "lucide-react";
import ImportMacroFactorModal from "./ImportMacroFactorModal";
import ForageBottomBar from "../ForageBottomBar";
import { SettingsGroup, type SettingsRowItem } from "@/components/settings/SettingsList";

type SettingsRow = SettingsRowItem;

export default function ForageSettingsPage() {
  const router = useRouter();

  // STATE
  const [isImportOpen, setIsImportOpen] = useState(false);

  const generalRows: SettingsRow[] = [
    {
      icon: Ruler,
      label: "Units",
      onClick: () => router.push("/modules/forage/ui/settings/units"),
    },
    {
      icon: Keyboard,
      label: "Data input",
      onClick: () => router.push("/modules/forage/ui/settings/data-input"),
    },
  ];

  const featureRows: SettingsRow[] = [
    {
      icon: Apple,
      label: "Food library",
      onClick: () => router.push("/modules/forage/ui/library"),
    },
    {
      icon: Clock,
      label: "Favorites",
      onClick: () => router.push("/modules/forage/ui/settings/favorites"),
    },
    {
      icon: BellRing,
      label: "Home badge",
      onClick: () => router.push("/modules/forage/ui/settings/home-badge"),
    },
  ];

  const notificationRows: SettingsRow[] = [
    {
      icon: Bell,
      label: "Check-in reminders",
      onClick: () => router.push("/modules/forage/ui/settings/check-in"),
    },
  ];

  const dataRows: SettingsRow[] = [
    {
      icon: Upload,
      label: "Import from MacroFactor",
      onClick: () => setIsImportOpen(true),
    },
  ];

  return (
    /* PAGE — locked shell with an inner scroll region so the bottom tab bar
       stays pinned (matches the dashboard / food-log layout). */
    <div className="page-with-bottom-bar">

      {/* PAGE SCROLL — the only scrollable surface. */}
      <div className="page-scroll">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title"><Settings className="w-6 h-6" /> Settings</h1>

        {/* GENERAL SECTION */}
        <h2 className="settings-section-title">General</h2>
        <SettingsGroup rows={generalRows} />

        {/* FEATURE SETTINGS SECTION */}
        <h2 className="settings-section-title">Feature Settings</h2>
        <SettingsGroup rows={featureRows} />

        {/* NOTIFICATIONS SECTION */}
        <h2 className="settings-section-title">Notifications</h2>
        <SettingsGroup rows={notificationRows} />

        {/* DATA SECTION */}
        <h2 className="settings-section-title">Data</h2>
        <SettingsGroup rows={dataRows} />
      </div>

      </div>

      {/* BOTTOM BAR — settings is the "More" destination; no search here.
          FAB opens the shared Shortcuts sheet. */}
      <ForageBottomBar active="more" />

      {/* IMPORT MODAL */}
      <ImportMacroFactorModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={() => setIsImportOpen(false)}
      />
    </div>
  );
}
