"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRowNav } from "@/lib/useRowNav";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/linkButton";
import { Clock, Dumbbell, Layers, Play, Plus, Zap, History, BarChart3, Settings, CalendarDays } from "lucide-react";
import { Program } from "../../types/program";
import { WorkoutSession } from "../../types/workoutSession";
import ProgramDashboard from "../../components/ProgramDashboard";
import GolemMenu, { type GolemMenuSection } from "../../components/GolemMenu";
import GolemCalendarWidget from "../../components/GolemCalendarWidget";
import HelpButton from "@/components/ui/HelpButton";

export default function GolemHomePage() {

  // DATA
  const [exerciseCount, setExerciseCount] = useState(0);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);
  const [currentSession, setCurrentSession] = useState<WorkoutSession | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const router = useRouter();

  const rowNav = useRowNav();

  // LOAD DATA
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [exercisesResponse, programResponse, sessionResponse] = await Promise.all([
        fetch("/modules/golem/api/exercises"),
        fetch("/modules/golem/api/programs/current"),
        fetch("/modules/golem/api/sessions/current"),
      ]);

      if (exercisesResponse.ok) {
        const data = await exercisesResponse.json();
        setExerciseCount(data.length);
      }

      if (programResponse.ok) {
        const data = await programResponse.json();
        setCurrentProgram(data);
      }

      if (sessionResponse.ok) {
        const data = await sessionResponse.json();
        setCurrentSession(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create a new workout session and navigate to it
  const handleAddSession = async () => {
    setIsCreatingSession(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch("/modules/golem/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Workout ${today}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to create session");
        return;
      }

      const { id } = await response.json();
      router.push(`/modules/golem/ui/session/${id}?new=true`);
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to create session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  // CATEGORIZED HOME MENU — quick links to the read surfaces used during/after a
  // session, plus a single entry into the full settings hub (which carries the
  // less-frequent library, programming, and account surfaces).
  const menuSections: GolemMenuSection[] = [
    {
      title: "Browse",
      items: [
        { icon: Dumbbell, label: "Exercise Library", hint: exerciseCount > 0 ? `${exerciseCount} movements` : "Browse and edit movements", href: "/modules/golem/ui/exercises" },
        { icon: CalendarDays, label: "Calendar", hint: "Workouts by day", href: "/modules/golem/ui/calendar" },
        { icon: History, label: "Workout History", hint: "Past sessions and imports", href: "/modules/golem/ui/history" },
        { icon: BarChart3, label: "Weekly Volume", hint: "Sets per muscle vs. landmarks", href: "/modules/golem/ui/volume" },
      ],
    },
    {
      title: "Configure",
      items: [
        { icon: Settings, label: "Settings", hint: "Locations, templates, archetypes, profile", href: "/modules/golem/ui/settings" },
      ],
    },
  ];

  return (

    // PAGE
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="mb-8 flex items-center justify-between gap-2">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            <Dumbbell className="w-8 h-8" />
            Workout Tracker
          </h1>

          {/* HELP */}
          <HelpButton
            title="Workout Tracker"
            sections={[
              { heading: "Getting started", body: "Tap New Session to log a workout freehand, or Generate Program to build a structured multi-week plan the app fills in for you." },
              { heading: "During a workout", body: "Open the active session to add exercises and log each set (weight × reps), then mark it complete. The pre-workout view suggests today's targets from your program. A session generated more than a week ago shows a warning — its exercises and loads came from your history as it was back then, so regenerate it for up-to-date targets." },
              { heading: "Review & configure", body: "Browse the Exercise Library, Calendar, Workout History, and Weekly Volume (sets per muscle vs. landmarks). Locations, templates, archetypes, and your profile live in Settings." },
            ]}
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mb-6">

          {/* ADD SESSION BUTTON */}
          <Button
            className="btn-blue"
            onClick={handleAddSession}
            disabled={isCreatingSession}
          >
            <Plus className="w-4 h-4" />
            {isCreatingSession ? "Creating..." : "New Session"}
          </Button>

          {/* GENERATE PROGRAM BUTTON */}
          <LinkButton
            className="btn-blue"
            href="/modules/golem/ui/programs/generate"
          >
            <Zap className="w-4 h-4" />
            Generate Program
          </LinkButton>
        </div>

        {/* CURRENT SESSION CARD */}
        {(isLoading || currentSession) && (
          <div
            className="card cursor-pointer mb-6"
            {...(currentSession ? rowNav(`/modules/golem/ui/session/${currentSession.id}`) : {})}
          >

            {/* HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <Play className="w-5 h-5" />
                Current Session
              </h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">
              {isLoading ? (

                // LOADING PLACEHOLDER
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : currentSession && (

                // SESSION DETAILS
                <div className="flex items-center justify-between">

                  {/* SESSION NAME */}
                  <p className="text-page-subtitle">{currentSession.name}</p>

                  {/* DURATION */}
                  {currentSession.duration != null && currentSession.duration > 0 && (
                    <div className="flex items-center gap-1 text-sm opacity-70">
                      <Clock className="w-4 h-4" />
                      {Math.floor(currentSession.duration / 60)}m
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROGRAM DASHBOARD */}
        {(isLoading || currentProgram) && (
          <div
            className="card cursor-pointer mb-6"
            {...(currentProgram ? rowNav(`/modules/golem/ui/programs/${currentProgram.id}`) : {})}
          >

            {/* HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <div>
                <h2 className="text-card-title">
                  <Layers className="w-5 h-5" />
                  Program
                </h2>

                {/* PROGRAM NAME */}
                <p className="text-page-subtitle">
                  {currentProgram ? currentProgram.name : "\u00A0"}
                </p>
              </div>
            </div>

            {/* CHART */}
            <div className="card-content">
              {isLoading ? (

                // LOADING PLACEHOLDER
                <div className="loading-container" style={{ height: 164 }}>
                  <div className="loading-spinner" />
                </div>
              ) : currentProgram && (

                // CHART CONTENT
                <ProgramDashboard program={currentProgram} />
              )}
            </div>
          </div>
        )}

        {/* CALENDAR WIDGET CARD — navigable month grid + agenda of the selected day's workouts.
            Two-pane on wide cards, stacks on mobile (the primary target). */}
        <div className="card mb-6">
          <GolemCalendarWidget />
        </div>

        {/* CATEGORIZED NAVIGATION MENU */}
        <GolemMenu sections={menuSections} startDelayMs={60} />
      </div>
    </div>
  );
}
