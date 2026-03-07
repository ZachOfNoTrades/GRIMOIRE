"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { ExerciseSummary, ExerciseHistoryEntry } from "../../../types/exercise";
import { ExerciseWithMuscleGroups } from "../../../types/muscleGroup";
import HistoryTab from "./HistoryTab";
import StatsTab from "./StatsTab";
import InfoTab from "./InfoTab";

interface ExerciseInfoModalProps {
  exercise: ExerciseSummary | null;
  onClose: () => void;
  onSelect: (exercise: ExerciseSummary) => void;
  zIndex: number;
}

export default function ExerciseInfoModal({
  exercise,
  onClose,
  onSelect,
  zIndex,
}: ExerciseInfoModalProps) {

  // DATA
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [detail, setDetail] = useState<ExerciseWithMuscleGroups | null>(null);

  // STATE
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "stats" | "info">("history");

  // Fetch exercise history and detail when exercise changes
  useEffect(() => {
    if (!exercise) return;

    setActiveTab("history");
    setHistoryLoading(true);
    setDetailLoading(true);
    setHistory([]);
    setDetail(null);

    Promise.all([
      fetch(`/modules/west/api/exercises/${exercise.id}/history`),
      fetch(`/modules/west/api/exercises/${exercise.id}`),
    ])
      .then(async ([historyRes, detailRes]) => {
        if (historyRes.ok) setHistory(await historyRes.json());
        if (detailRes.ok) setDetail(await detailRes.json());
      })
      .catch((error) => {
        console.error("Error fetching exercise info:", error);
      })
      .finally(() => {
        setHistoryLoading(false);
        setDetailLoading(false);
      });
  }, [exercise]);

  return (
    <Modal
      isOpen={!!exercise}
      onClose={onClose}
      title={
        <span className="flex items-center justify-between w-full mr-2">
          <span>{exercise?.name ?? "Exercise Info"}</span>
          {/* REPLACE BUTTON */}
          <Button
            onClick={() => { if (exercise) onSelect(exercise); }}
            className="btn-link !py-0"
          >
            Replace
          </Button>
        </span>
      }
      zIndex={zIndex}
      fullHeight
    >

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
    </Modal>
  );
}
