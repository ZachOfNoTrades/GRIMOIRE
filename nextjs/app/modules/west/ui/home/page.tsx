"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dumbbell, Layers, Plus, Zap } from "lucide-react";
import { Program } from "../../types/program";
import ProgramDashboard from "../../components/ProgramDashboard";

export default function WestHomePage() {

  // DATA
  const [exerciseCount, setExerciseCount] = useState(0);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [exercisesResponse, programResponse] = await Promise.all([
        fetch("/modules/west/api/exercises"),
        fetch("/modules/west/api/programs/current"),
      ]);

      if (exercisesResponse.ok) {
        const data = await exercisesResponse.json();
        setExerciseCount(data.length);
      }

      if (programResponse.ok) {
        const data = await programResponse.json();
        setCurrentProgram(data);
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
      const response = await fetch("/modules/west/api/sessions", {
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
      router.push(`/modules/west/ui/session/${id}?new=true`);
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to create session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  return (

    // PAGE
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="mb-8">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            <Dumbbell className="w-8 h-8" />
            Workout Tracker
          </h1>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mb-6">

          {/* ADD SESSION BUTTON */}
          <Button
            className="btn-primary"
            onClick={handleAddSession}
            disabled={isCreatingSession}
          >
            <Plus className="w-4 h-4" />
            {isCreatingSession ? "Creating..." : "New Session"}
          </Button>

          {/* GENERATE PROGRAM BUTTON */}
          <Button
            className="btn-primary"
            onClick={() => router.push("/modules/west/ui/programs/generate")}
          >
            <Zap className="w-4 h-4" />
            Generate Program
          </Button>
        </div>

        {/* PROGRAM DASHBOARD */}
        {(isLoading || currentProgram) && (
          <div
            className="card cursor-pointer mb-6"
            onClick={() => currentProgram && router.push(`/modules/west/ui/programs/${currentProgram.id}`)}
          >

            {/* HEADER */}
            <div className="card-header">

              {/* PROGRAM NAME */}
              <h2 className="text-card-title">
                <Layers className="w-5 h-5" />
                {currentProgram ? currentProgram.name : "Loading program..."}
              </h2>
            </div>

            {/* CHART */}
            <div className="card-content">
              {isLoading ? (

                // LOADING PLACEHOLDER
                <p className="text-secondary text-center py-8">Loading...</p>
              ) : currentProgram && (

                // CHART CONTENT
                <ProgramDashboard program={currentProgram} />
              )}
            </div>
          </div>
        )}

        {/* NAVIGATION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* EXERCISES CARD */}
          <Link href="/modules/west/ui/exercises">
            <div className="module-card">
              <h2 className="text-card-title">Exercise Library</h2>
            </div>
          </Link>

          {/* HISTORY CARD */}
          <Link href="/modules/west/ui/history">
            <div className="module-card">
              <h2 className="text-card-title">Workout History</h2>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
