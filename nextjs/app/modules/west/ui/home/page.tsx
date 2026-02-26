"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus } from "lucide-react";

export default function WestHomePage() {

  // DATA
  const [exerciseCount, setExerciseCount] = useState(0);

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
      const response = await fetch("/modules/west/api/exercises");
      if (response.ok) {
        const data = await response.json();
        setExerciseCount(data.length);
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
          sessionDate: today,
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

        {/* ADD SESSION BUTTON */}
        <div className="mb-6">
          <Button
            className="btn-primary"
            onClick={handleAddSession}
            disabled={isCreatingSession}
          >
            <Plus className="w-4 h-4" />
            {isCreatingSession ? "Creating..." : "New Session"}
          </Button>
        </div>

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
