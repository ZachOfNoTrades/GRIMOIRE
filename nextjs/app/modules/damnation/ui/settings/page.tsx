"use client";

import { ArrowLeft, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { BackLink } from "@/components/BackLink";
import HelpButton from "@/components/ui/HelpButton";
import type { DamnationSettings } from "../../types/damnation";

const SETTINGS_HELP = [
  {
    heading: "Commander damage",
    body: (
      <>
        On: every card in your games has a Commander damage taken section, and 21 from one commander puts a player out.
        Off: for other formats — the section only holds the Out control. Changes reach games already in
        progress straight away.
      </>
    ),
  },
];

export default function DamnationSettingsPage() {
  // DATA
  const [settings, setSettings] = useState<DamnationSettings | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingGame, setIsSavingGame] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/modules/damnation/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("Couldn't load settings");
        setSettings(await response.json());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't load settings");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Saves on change: a single switch has nothing to review before saving.
  async function saveCommanderDamage(enabled: boolean) {
    setIsSavingGame(true);
    try {
      const response = await fetch("/modules/damnation/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commander_damage_enabled: enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't save");
      setSettings((current) => (current ? { ...current, commander_damage_enabled: data.commander_damage_enabled } : data));
      toast.success(enabled ? "Commander damage on" : "Commander damage off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setIsSavingGame(false);
    }
  }

  return (
    <div className="page">
      <div className="page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex items-center justify-between mb-6">

          {/* BACK TO DAMNATION HOME */}
          <BackLink className="btn btn-link !pl-0" fallback="/modules/damnation/ui/home" aria-label="Back to Damnation">
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* HELP */}
          <HelpButton title="Damnation settings" sections={SETTINGS_HELP} />
        </div>

        {/* PAGE TITLE */}
        <h1 className="text-page-title">
          <Settings className="w-7 h-7" /> Settings
        </h1>

        {/* LOADING PLACEHOLDER */}
        {isLoading && <p className="text-secondary">Loading settings…</p>}

        {/* GAME CARD */}
        {!isLoading && settings && (
          <div className="card max-w-3xl">

            {/* CARD HEADER */}
            <div className="card-header">
              <h2 className="text-card-title">Games</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {/* COMMANDER DAMAGE TOGGLE */}
              <label className="flex items-center gap-2 text-primary">
                <input
                  type="checkbox"
                  checked={settings.commander_damage_enabled}
                  disabled={isSavingGame}
                  onChange={(event) => saveCommanderDamage(event.target.checked)}
                />
                Track commander damage
              </label>

              {/* COMMANDER DAMAGE HINT */}
              <p className="text-secondary">Turn off for formats other than Commander.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
