"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, Users, Cpu } from "lucide-react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SettingsGroup, type SettingsRowItem } from "@/components/settings/SettingsList";

// Admin settings hub — the same grouped-rows layout as the per-user Settings hub.
// Global-admin only (the subtree layout guards it). Each row opens its own page.
export default function AdminSettingsPage() {
  const router = useRouter();

  const accountRows: SettingsRowItem[] = [
    {
      icon: Users,
      label: "Users",
      onClick: () => router.push("/settings/ui/admin/users"),
    },
  ];

  const aiRows: SettingsRowItem[] = [
    {
      icon: Cpu,
      label: "Recommended models",
      onClick: () => router.push("/settings/ui/admin/llm"),
    },
  ];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs label="Admin" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title"><ShieldCheck className="w-6 h-6" /> Admin</h1>

        {/* ACCOUNTS SECTION */}
        <h2 className="settings-section-title">Accounts</h2>
        <SettingsGroup rows={accountRows} />

        {/* AI SECTION */}
        <h2 className="settings-section-title">AI</h2>
        <SettingsGroup rows={aiRows} />
      </div>
    </div>
  );
}
