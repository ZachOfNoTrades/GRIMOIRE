"use client";

import { SunMoon } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { SettingsBackLink, SettingsControlRow } from "@/components/settings/SettingsList";
import SegmentedToggle, { type SegmentedOption } from "@/components/ui/SegmentedToggle";
import HelpButton from "@/components/ui/HelpButton";
import { useTheme } from "@/lib/useTheme";
import { ThemeMode } from "@/types/preferences";

// Automatic first (it's the default), then light → dark so the pills read as a
// progression rather than an arbitrary list.
const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  { value: "auto",  label: "Automatic" },
  { value: "light", label: "Light" },
  { value: "dark",  label: "Dark" },
];

export default function ThemeSettingsPage() {

  // INPUT — the saved preference (dbo.user_preferences). The hook repaints
  // immediately and persists in the background, rolling back on failure.
  const { theme, changeTheme, isSaving } = useTheme();

  async function pickTheme(next: ThemeMode) {
    const saved = await changeTheme(next);
    if (!saved) {
      toast.error("Couldn't save your theme");
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Settings" fallback="/settings/ui/home" />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>
            <SunMoon className="w-6 h-6" /> Theme
          </h1>
          <HelpButton
            title="Theme"
            sections={[
              { heading: "Automatic", body: "Follows your browser or device setting." },
              { heading: "Light / Dark", body: "Pins the app to that scheme on every device you sign in to." },
            ]}
          />
        </div>

        {/* THEME SELECTION — a labeled row in the group card (not a bare control
            under the heading, which read as unfinished on a wide screen), holding
            one pill track of three segments (SegmentedToggle, the same widget as
            forage's Consumed/Remaining switch). Announced as a radiogroup because
            it sets a preference rather than swapping a view. */}
        <div>
          <h2 className="settings-section-title">Appearance</h2>
          <div className="settings-group">
            <SettingsControlRow label="Mode">
              <SegmentedToggle
                options={THEME_OPTIONS}
                value={theme}
                onChange={pickTheme}
                disabled={isSaving}
                a11y="radio"
                ariaLabel="Theme"
                /* Content-sized on desktop (the reference segmented control);
                   the CSS stretches it to the row width once stacked. */
                style={{ width: "100%" }}
              />
            </SettingsControlRow>
          </div>
        </div>

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
