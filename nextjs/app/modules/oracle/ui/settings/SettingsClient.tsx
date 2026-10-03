"use client";

import { Minus, Plus, Settings } from "lucide-react";
import { useRef, useState } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SettingsControlRow, SettingsToggleRow } from "@/components/settings/SettingsList";
import { Toaster, toast } from "@/components/Toaster";
import { blurOnEnter, selectOnFocus } from "@/lib/inputBehavior";
import { api, errorMessage } from "../../lib/client";
import { CHIP_POOL_MAX, CHIP_SECONDS_MAX, CHIP_SECONDS_MIN, GENERATION_TASKS, TEXT_MODELS, type TextModel } from "../../lib/constants";
import type { OracleSettings } from "../../types/oracle";

export default function SettingsClient({ settings: initialSettings }: { settings: OracleSettings }) {
  // DATA
  const [settings, setSettings] = useState<OracleSettings>(initialSettings);

  // INPUT — the seconds field keeps what was typed until it is committed
  const [secondsText, setSecondsText] = useState(String(initialSettings.chip_seconds));

  // The last value the server confirmed, so a failed save can go back to it.
  const savedRef = useRef<OracleSettings>(initialSettings);

  // Saves on change: each control is a single value with nothing to review before saving.
  async function save(patch: Partial<Omit<OracleSettings, "models">> & { models?: Partial<OracleSettings["models"]> }) {
    const next: OracleSettings = { ...settings, ...patch, models: { ...settings.models, ...(patch.models ?? {}) } };
    setSettings(next);
    try {
      const saved = await api<OracleSettings>("/modules/oracle/api/settings", "PUT", patch);
      savedRef.current = saved;
    } catch (error) {
      setSettings(savedRef.current);
      setSecondsText(String(savedRef.current.chip_seconds));
      toast.error(errorMessage(error, "Couldn't save the settings"));
    }
  }

  function commitSeconds(raw: string) {
    const parsed = Number(raw);
    const seconds = Number.isFinite(parsed) && raw.trim() !== "" ? Math.min(CHIP_SECONDS_MAX, Math.max(CHIP_SECONDS_MIN, Math.round(parsed))) : settings.chip_seconds;
    setSecondsText(String(seconds));
    if (seconds !== settings.chip_seconds) save({ chip_seconds: seconds });
  }

  function step(delta: number) {
    commitSeconds(String(settings.chip_seconds + delta));
  }

  return (
    // PAGE
    <div className="page">

      {/* TOAST CONTAINER */}
      <Toaster position="bottom-right" />

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">
          <Settings className="w-6 h-6" /> Settings
        </h1>

        {/* IDEAS BANNER SECTION */}
        <h2 className="settings-section-title">Ideas banner</h2>
        <div className="settings-group">

          {/* RATE ROW */}
          <SettingsControlRow label="Seconds per new idea">
            <span className="orc-rate">

              {/* SLOWER / FEWER SECONDS */}
              <button type="button" className="orc-rate-step" onClick={() => step(-5)} aria-label="5 seconds faster" title="5 seconds faster">
                <Minus className="w-4 h-4" />
              </button>

              {/* SECONDS FIELD — not autofocused: this is a settings page read top to bottom. */}
              <input
                id="orc-chip-seconds"
                className="input-field"
                inputMode="numeric"
                aria-label="Seconds per new idea"
                value={secondsText}
                onFocus={selectOnFocus}
                onChange={(event) => setSecondsText(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                onBlur={(event) => commitSeconds(event.target.value)}
                onKeyDown={blurOnEnter}
              />

              {/* MORE SECONDS */}
              <button type="button" className="orc-rate-step" onClick={() => step(5)} aria-label="5 seconds slower" title="5 seconds slower">
                <Plus className="w-4 h-4" />
              </button>
            </span>
          </SettingsControlRow>

          {/* PICTURES TOGGLE */}
          <SettingsToggleRow
            label="Mix in reference pictures"
            hint="Pictures of creatures, people and places that could enter the session"
            checked={settings.banner_images}
            onChange={(next) => save({ banner_images: next })}
          />
        </div>

        {/* BANNER NOTE */}
        <p className="settings-group-note">
          The banner on the Table tab brings on one idea every {settings.chip_seconds} seconds ({CHIP_SECONDS_MIN} to {CHIP_SECONDS_MAX}) and cycles
          through a pool of up to {CHIP_POOL_MAX}, prepared in batches by Claude. Ideas come round again until you use them, so the speed does not
          change how much of your Claude allowance the banner spends: it only prepares more once an idea has been used. Pointing at the banner pauses
          it, and it stops while the tab is in the background. Saved as soon as you change it; the Table tab picks it up the next time it is opened.
        </p>

        {/* MODELS SECTION — one model per kind of generation */}
        <h2 className="settings-section-title">Models</h2>
        <div className="settings-group">
          {GENERATION_TASKS.map((task) => (
            <SettingsControlRow key={task.key} label={task.label}>
              <select
                className="input-field orc-model-select"
                aria-label={`Model for ${task.label.toLowerCase()}`}
                value={settings.models[task.key]}
                onChange={(event) => save({ models: { [task.key]: event.target.value as TextModel } })}
              >
                {TEXT_MODELS.map((model) => (
                  <option key={model.key} value={model.key}>{model.label}</option>
                ))}
              </select>
            </SettingsControlRow>
          ))}
        </div>

        {/* MODELS NOTE */}
        <p className="settings-group-note">Which Claude model writes each kind of thing. Saved as soon as you change it.</p>
      </div>
    </div>
  );
}
