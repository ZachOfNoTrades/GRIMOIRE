"use client";

import { ArrowLeft, History, Monitor, Settings, Skull } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { HOST_HELP } from "../../components/help";
import type { SessionSummary } from "../../types/damnation";

export default function DamnationHomePage() {
  const router = useRouter();

  // DATA
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  // At most one game is open at a time.
  const openGame = sessions.find((session) => session.status !== "finished") ?? null;

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
    setIsCreating(true);
    try {
      const response = await fetch("/modules/damnation/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
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

            {/* HISTORY LINK */}
            <Link className="btn btn-link" href="/modules/damnation/ui/history" aria-label="Game history" title="Game history">
              <History className="w-5 h-5" />
            </Link>

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
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">New game</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">
            {isLoading ? (

              /* LOADING PLACEHOLDER — nothing is offered until it is known whether a game is open */
              <p className="text-secondary">Loading games…</p>
            ) : openGame ? (
              <>
                {/* OPEN GAME HINT — one open game at a time */}
                <p className="text-secondary">You have a game open ({openGame.join_code}). End it to start a new one.</p>

                {/* OPEN BOARD BUTTON */}
                <Button className="btn-blue" onClick={() => router.push(`/modules/damnation/ui/board/${openGame.id}`)}>
                  <Monitor className="w-4 h-4" /> Open board
                </Button>
              </>
            ) : (
              <>
                {/* HINT */}
                <p className="text-secondary">Starting life and the number of players are set on the board.</p>

                {/* START BUTTON */}
                <Button className="btn-green" onClick={createGame} disabled={isCreating}>
                  <Monitor className="w-4 h-4" /> {isCreating ? "Starting…" : "Start game & open board"}
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
