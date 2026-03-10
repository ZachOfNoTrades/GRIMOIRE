"use client"

import { useState, useEffect } from "react";
import { ExerciseSummary, ExerciseHistoryEntry } from "../../../types/exercise";
import { ExerciseWithMuscleGroups } from "../../../types/muscleGroup";
import HistoryTab from "./HistoryTab";
import StatsTab from "./StatsTab";
import InfoTab from "./InfoTab";

interface ExerciseInfoViewProps {
  exercise: ExerciseSummary;
}

export default function ExerciseInfoView({
  exercise,
}: ExerciseInfoViewProps) {

  // DATA
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [detail, setDetail] = useState<ExerciseWithMuscleGroups | null>(null);

  // STATE
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "stats" | "info">("history");

  // Fetch exercise history and detail when viewing a different exercise
  useEffect(() => {
    setActiveTab("history");
    setHistoryLoading(true);
    setDetailLoading(true);
    setHistory([]);
    setDetail(null);

    Promise.all([
      fetch(`/modules/golem/api/exercises/${exercise.id}/history`),
      fetch(`/modules/golem/api/exercises/${exercise.id}`),
    ])
      .then(async ([historyRes, detailRes]) => {
        if (historyRes.ok) {
          const data = await historyRes.json();
          setHistory(data.history);
        }
        if (detailRes.ok) setDetail(await detailRes.json());
      })
      .catch((error) => {
        console.error("Error fetching exercise info:", error);
      })
      .finally(() => {
        setHistoryLoading(false);
        setDetailLoading(false);
      });
  }, [exercise.id]);

  return (
    <>
      {/* TAB NAVIGATION */}
      <nav className="flex sm:space-x-1 px-2 border-b border-card" role="tablist">
        <button
          onClick={() => setActiveTab("history")}
          className={`tab-button max-sm:flex-1 max-sm:justify-center ${activeTab === "history" ? "tab-button-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "history"}
        >
          <span>History</span>
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`tab-button max-sm:flex-1 max-sm:justify-center ${activeTab === "stats" ? "tab-button-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "stats"}
        >
          <span>Stats</span>
        </button>
        <button
          onClick={() => setActiveTab("info")}
          className={`tab-button max-sm:flex-1 max-sm:justify-center ${activeTab === "info" ? "tab-button-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "info"}
        >
          <span>Info</span>
        </button>
      </nav>

      {/* TAB CONTENT */}
      <div className="min-h-[40vh]">
        {activeTab === "info" ? (
          <InfoTab exercise={detail} loading={detailLoading} />
        ) : activeTab === "history" ? (
          <HistoryTab history={history} loading={historyLoading} />
        ) : (
          <StatsTab history={history} loading={historyLoading} />
        )}
      </div>
    </>
  );
}
