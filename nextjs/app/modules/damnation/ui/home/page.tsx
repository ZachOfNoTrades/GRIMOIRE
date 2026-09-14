"use client";

import { ArrowLeft, Monitor, Settings, Skull } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { MAX_SEATS, MIN_SEATS, STARTING_LIFE_PRESETS } from "../../lib/constants";
import { HOST_HELP } from "../../components/help";
import type { SessionSummary } from "../../types/damnation";

const SEAT_OPTIONS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, index) => MIN_SEATS + index);

export default function DamnationHomePage() {
  const router = useRouter();

  // DATA
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  // INPUT
  const [startingLife, setStartingLife] = useState<number>(40);
  const [customLife, setCustomLife] = useState<string>("");
  const [maxSeats, setMaxSeats] = useState<number>(4);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const isCustom = !STARTING_LIFE_PRESETS.includes(startingLife as (typeof STARTING_LIFE_PRESETS)[number]);
  const liveSessions = sessions.filter((session) => session.status !== "finished");
  const pastSessions = sessions.filter((session) => session.status === "finished");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/modules/damnation/api/sessions", { cache: "no-store" });
        if (response.ok) setSessions(await response.json());
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function createGame() {
    const life = isCustom ? Number.parseInt(customLife, 10) : startingLife;
    if (!Number.isInteger(life) || life < 1 || life > 999) {
      toast.error("Starting life must be between 1 and 999");
      return;
    }
    setIsCreating(true);
    try {
      const response = await fetch("/modules/damnation/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ starting_life: life, max_seats: maxSeats }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't start a game");
      router.push(`/modules/damnation/ui/board/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start a game");
      setIsCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex items-center justify-between mb-6">

          {/* BACK TO DASHBOARD */}
          <BackLink className="btn btn-link !pl-0" fallback="/dashboard" aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* HEADER ACTIONS */}
          <div className="flex items-center gap-1">

            {/* SETTINGS LINK */}
            <Link className="btn btn-link" href="/modules/damnation/ui/settings" aria-label="Damnation settings" title="Settings">
              <Settings className="w-5 h-5" />
            </Link>

            {/* HELP */}
            <HelpButton title="Damnation" sections={HOST_HELP} />
          </div>
        </div>

        {/* PAGE TITLE */}
        <h1 className="text-page-title">
          <Skull className="w-7 h-7" /> Damnation
        </h1>

        {/* PAGE SUBTITLE */}
        <p className="text-page-subtitle mb-6">MTG life tracker — show the board on a screen, everyone plays from their phone.</p>

        {/* NEW GAME CARD */}
        <div className="card mb-6">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">New game</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* STARTING LIFE LABEL */}
            <div className="text-h2">Starting life</div>

            {/* STARTING LIFE PICKER */}
            <div className="flex flex-wrap gap-2">
              {STARTING_LIFE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  className={startingLife === preset ? "btn-blue" : "btn-off"}
                  onClick={() => setStartingLife(preset)}
                  aria-pressed={startingLife === preset}
                >
                  {preset}
                </Button>
              ))}
              <Button
                className={isCustom ? "btn-blue" : "btn-off"}
                onClick={() => setStartingLife(0)}
                aria-pressed={isCustom}
              >
                Custom
              </Button>
            </div>

            {/* CUSTOM LIFE FIELD — autofocused because choosing Custom means typing a number next */}
            {isCustom && (
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                className="input-field max-w-[10rem]"
                placeholder="e.g. 25"
                value={customLife}
                onChange={(event) => setCustomLife(event.target.value)}
                aria-label="Custom starting life"
              />
            )}

            {/* SEATS LABEL */}
            <div className="text-h2 mt-2">Seats</div>

            {/* SEATS PICKER */}
            <div className="flex flex-wrap gap-2">
              {SEAT_OPTIONS.map((seats) => (
                <Button
                  key={seats}
                  className={maxSeats === seats ? "btn-blue" : "btn-off"}
                  onClick={() => setMaxSeats(seats)}
                  aria-pressed={maxSeats === seats}
                >
                  {seats}
                </Button>
              ))}
            </div>

            {/* START BUTTON */}
            <Button className="btn-green mt-2" onClick={createGame} disabled={isCreating}>
              <Monitor className="w-4 h-4" /> {isCreating ? "Starting…" : "Start game & open board"}
            </Button>
          </div>
        </div>

        {/* GAMES CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">Your games</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">
            {isLoading ? (
              /* LOADING PLACEHOLDER */
              <p className="text-secondary">Loading games…</p>
            ) : sessions.length === 0 ? (
              /* EMPTY PLACEHOLDER */
              <p className="text-secondary">No games yet.</p>
            ) : (
              <>
                {/* LIVE GAMES */}
                {liveSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 border-b pb-2">
                    <div className="min-w-0">
                      <div className="text-primary font-bold">
                        {session.join_code} · {session.player_count}/{session.max_seats} players
                      </div>
                      <div className="text-secondary">
                        {session.status === "lobby" ? "Joining open" : "In progress"} · started{" "}
                        {new Date(session.ts_created).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                    <Button className="btn-blue" onClick={() => router.push(`/modules/damnation/ui/board/${session.id}`)}>
                      Open board
                    </Button>
                  </div>
                ))}

                {/* PAST GAMES */}
                {pastSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 border-b pb-2">
                    <div className="min-w-0">
                      <div className="text-primary">{session.player_count} players · {session.starting_life} life</div>
                      <div className="text-secondary">
                        {new Date(session.ts_created).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                    <Button className="btn-off" onClick={() => router.push(`/modules/damnation/ui/board/${session.id}`)}>
                      View
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
