"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, ListChecks, TrendingUp, Target } from "lucide-react";

export default function WestHomePage() {

  // DATA
  const [exerciseCount, setExerciseCount] = useState(0);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

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
  }

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

        {/* NAVIGATION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* EXERCISES CARD */}
          <Link href="/modules/west/ui/exercises">
            <div className="module-card">
              <h2 className="text-card-title">Exercise Library</h2>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
