"use client";

import { History, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { SettingsBackLink } from "@/components/settings/SettingsList";
import { Button } from "@/components/ui/button";
import type { SessionSummary } from "../../types/damnation";

// Games that are over, newest first. Each board still shows its final totals and activity; a game
// that is over stays that way.
export default function DamnationHistoryPage() {
  const router = useRouter();

  // DATA
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/modules/damnation/api/sessions", { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load games (${response.status})`);
        setSessions(await response.json());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't load your games");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const past = sessions.filter((session) => session.status === "finished");

  return (

    // PAGE
    <div className="page">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BACK */}
        <SettingsBackLink label="Damnation" fallback="/modules/damnation/ui/home" />

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">
          <History className="w-6 h-6" /> Game history
        </h1>

        {/* GAMES CARD */}
        <div className="card">
          <div className="card-content">
            {isLoading ? (

              /* LOADING PLACEHOLDER */
              <p className="text-secondary">Loading games…</p>
            ) : past.length === 0 ? (

              /* EMPTY PLACEHOLDER */
              <p className="text-secondary">No games have finished yet.</p>
            ) : (
              past.map((session) => (

                /* PAST GAME */
                <div key={session.id} className="flex items-center justify-between gap-3 border-b pb-2">
                  <div className="min-w-0">
                    <div className="text-primary">
                      {session.player_count} {session.player_count === 1 ? "player" : "players"} · {session.starting_life} life
                    </div>
                    <div className="text-secondary">
                      {new Date(session.ts_created).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>

                  {/* VIEW BOARD */}
                  <Button className="btn-off" onClick={() => router.push(`/modules/damnation/ui/board/${session.id}`)} title="Show this game's board">
                    <Monitor className="w-4 h-4" /> View
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
