"use client";

import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { SettingsBackLink, SettingsToggleRow } from "@/components/settings/SettingsList";
import type { DamnationSettings } from "../../types/damnation";

export default function DamnationSettingsPage() {
  // DATA
  const [settings, setSettings] = useState<DamnationSettings | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/modules/damnation/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load settings (${response.status})`);
        setSettings(await response.json());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Saves on change: a single switch has nothing to review before saving.
  async function saveCommanderDamage(enabled: boolean) {
    if (isSaving || !settings) return;
    const previous = settings;
    setSettings({ ...settings, commander_damage_enabled: enabled });
    setIsSaving(true);
    try {
      const response = await fetch("/modules/damnation/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commander_damage_enabled: enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Failed to save settings (${response.status})`);
      setSettings(data);
    } catch (saveError) {
      setSettings(previous);
      toast.error(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {

    // LOADING PLACEHOLDER
    return (
      <div className="page">
        <div className="page-container">
          <p className="text-secondary">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (

    // PAGE
    <div className="page">

      {/* TOAST CONTAINER */}
      <Toaster position="bottom-right" />

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Damnation" fallback="/modules/damnation/ui/home" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">
          <Settings className="w-6 h-6" /> Settings
        </h1>

        {/* LOAD ERROR */}
        {error && <div className="alert-error mb-4">{error}</div>}

        {settings && (
          <>
            {/* GAMES SECTION */}
            <h2 className="settings-section-title">Games</h2>
            <div className="settings-group">

              {/* COMMANDER DAMAGE TOGGLE */}
              <SettingsToggleRow
                label="Track commander damage"
                hint="Default for new games; switch it for a game from the board's menu"
                checked={settings.commander_damage_enabled}
                disabled={isSaving}
                onChange={saveCommanderDamage}
              />
            </div>

            {/* GROUP NOTE */}
            <p className="settings-group-note">
              On: every card in a new game has a Commander damage taken section, and 21 from one commander puts a
              player out. Off: the section only holds the Out control. This is only where new games start — turn it
              on or off for a game from the ⋯ menu on its board. Saved as soon as you switch it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
