"use client"

import { useState, useEffect } from "react";
import { ArrowLeftRight, Save, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import ExercisePickerModal from "./ExercisePickerModal";
import DisableExerciseModal from "./DisableExerciseModal";
import { SegmentWithSets } from "../../../types/segment";
import { ExerciseSummary, ExerciseHistoryEntry } from "../../../types/exercise";
import { ExerciseWithMuscleGroups } from "../../../types/muscleGroup";
import { generateUUID } from "../../../utils/id";
import { HistoryRange, getDateRangeParams } from "../../../utils/format";
import SetTab from "./SetTab";
import HistoryTab from "./HistoryTab";
import StatsTab from "./StatsTab";
import InfoTab from "./InfoTab";

const tabs = [
  { id: "sets", label: "Sets" },
  { id: "history", label: "History" },
  { id: "stats", label: "Stats" },
  { id: "info", label: "Info" },
];

interface EditSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (segment: SegmentWithSets) => void;
  onRemove: () => void;
  segment: SegmentWithSets | null;
  exercises: ExerciseSummary[];
  isDeleting: boolean;
  onExerciseCreated: (exercise: ExerciseSummary) => void;
  onExerciseUpdated: (exercise: ExerciseSummary) => void;
}

export default function EditSegmentModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  segment,
  exercises,
  isDeleting,
  onExerciseCreated,
  onExerciseUpdated,
}: EditSegmentModalProps) {

  // INPUT
  const [editedSegment, setEditedSegment] = useState<SegmentWithSets | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("6m");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  // DATA
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [exerciseDetail, setExerciseWithMuscleGroups] = useState<ExerciseWithMuscleGroups | null>(null);

  // STATE
  const [activeTab, setActiveTab] = useState("sets");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isTogglingDisable, setIsTogglingDisable] = useState(false);

  // DERIVED
  const isExerciseDisabled = exerciseDetail?.is_disabled ?? false;

  // Disable exercise handler
  const handleDisableExercise = async () => {
    if (!editedSegment) return;
    setIsTogglingDisable(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${editedSegment.exercise_id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to disable exercise");
        return;
      }

      setExerciseWithMuscleGroups((prev) => prev ? { ...prev, is_disabled: true } : prev);
      setIsDisableModalOpen(false);
      toast.success("Exercise disabled");
    } catch (error) {
      toast.error("Failed to disable exercise");
      console.error("Error disabling exercise:", error);
    } finally {
      setIsTogglingDisable(false);
    }
  };

  // Enable exercise handler
  const handleEnableExercise = async () => {
    if (!editedSegment) return;
    setIsTogglingDisable(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${editedSegment.exercise_id}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to enable exercise");
        return;
      }

      setExerciseWithMuscleGroups((prev) => prev ? { ...prev, is_disabled: false } : prev);
      setIsDisableModalOpen(false);
      toast.success("Exercise enabled");
    } catch (error) {
      toast.error("Failed to enable exercise");
      console.error("Error enabling exercise:", error);
    } finally {
      setIsTogglingDisable(false);
    }
  };

  // Fetch exercise history with date range params
  const fetchHistory = async (exerciseId: string, startDate = "", endDate = "") => {
    if (!exerciseId) return;
    setHistoryLoading(true);

    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const queryString = params.toString();
    const url = `/modules/golem/api/exercises/${exerciseId}/history${queryString ? `?${queryString}` : ""}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch history");
        return response.json();
      })
      .then((data) => {
        setExerciseHistory(data.history);
        setTotalHistoryCount(data.totalCount);
      })
      .catch((error) => console.error("Error fetching exercise history:", error))
      .finally(() => setHistoryLoading(false));
  };

  // Fetch exercise detail data
  const fetchDetail = async (exerciseId: string) => {
    if (!exerciseId) return;
    setDetailLoading(true);

    fetch(`/modules/golem/api/exercises/${exerciseId}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch exercise details");
        return response.json();
      })
      .then((data) => setExerciseWithMuscleGroups(data))
      .catch((error) => console.error("Error fetching exercise details:", error))
      .finally(() => setDetailLoading(false));
  };

  // Sync local state when modal opens, add additional set rows
  useEffect(() => {
    if (isOpen && segment) {

      // Reset to Sets tab and date filter when modal opens
      setActiveTab("sets");
      setHistoryRange("6m");
      setHistoryStartDate("");
      setHistoryEndDate("");

      // Fetch exercise data in background on modal open
      const { startDate, endDate } = getDateRangeParams("6m");
      fetchHistory(segment.exercise_id, startDate, endDate);
      fetchDetail(segment.exercise_id);

      // Create a mutable clone of the given segment to avoid unsaved edits
      const clonedSegment = JSON.parse(JSON.stringify(segment));

      if (clonedSegment.target) {
        const targetWarmupCount = clonedSegment.target.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const targetWorkingCount = clonedSegment.target.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;
        const loggedWarmupCount = clonedSegment.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const loggedWorkingCount = clonedSegment.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;

        /**
         * CREATE ADDITIONAL SET ROWS
         * The following for loops add on to any existing logged set records from clonedSegment.
         * They add the difference between the existing logged set records and the total quantity of
         * prescribed target sets.
         *
         * If 0 logged sets and 2 target sets, creates 2 additional for a total of 2.
         * If 1 logged sets and 2 target sets, creates 1 additional for a total of 2.
         * If 3 logged sets and 2 target sets, creates 0 additional for a total of 3.
         */

        // Add additional warmup sets to reach target count, if necessary
        for (let i = loggedWarmupCount + 1; i <= targetWarmupCount; i++) {
          clonedSegment.sets.push({
            id: generateUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: true,
            reps: clonedSegment.exercise_is_timed ? null : 0,
            weight: 0,
            rpe: null,
            time_seconds: clonedSegment.exercise_is_timed ? 0 : null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }

        // Add additional working sets to reach target count, if necessary
        for (let i = loggedWorkingCount + 1; i <= targetWorkingCount; i++) {
          clonedSegment.sets.push({
            id: generateUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: false,
            reps: clonedSegment.exercise_is_timed ? null : 0,
            weight: 0,
            rpe: null,
            time_seconds: clonedSegment.exercise_is_timed ? 0 : null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }
      }

      setEditedSegment(clonedSegment);
    }
  }, [isOpen, segment]);

  // Re-fetch exercise data when exercise is swapped in the Set tab
  const currentExerciseId = editedSegment?.exercise_id;
  useEffect(() => {
    if (!isOpen || !currentExerciseId) return;

    // Skip if this is the initial load (already handled by the modal open effect)
    if (currentExerciseId === segment?.exercise_id) return;

    // Reset date filter on exercise swap
    setHistoryRange("6m");
    setHistoryStartDate("");
    setHistoryEndDate("");
    const { startDate, endDate } = getDateRangeParams("6m");
    fetchHistory(currentExerciseId, startDate, endDate);
    fetchDetail(currentExerciseId);
  }, [currentExerciseId]);

  if (!editedSegment) return null;

  const handleExerciseChange = (exerciseId: string) => {
    const selectedExercise = exercises.find((e) => e.id === exerciseId);
    if (!selectedExercise) return;
    const updatedSegment = {
      ...editedSegment,
      exercise_id: exerciseId,
      exercise_name: selectedExercise.name,
      exercise_category: selectedExercise.category,
      exercise_is_timed: selectedExercise.is_timed,
    };
    setEditedSegment(updatedSegment);
    onSave(updatedSegment);
  };

  const handleAutoSave = (updatedSegment: SegmentWithSets) => {
    if (!updatedSegment.exercise_id) return;
    onSave(updatedSegment);
  };

  const handleRangeChange = (newRange: HistoryRange) => {
    setHistoryRange(newRange);
    if (newRange !== "custom") {
      setHistoryStartDate("");
      setHistoryEndDate("");
      const { startDate, endDate } = getDateRangeParams(newRange);
      fetchHistory(editedSegment.exercise_id, startDate, endDate);
    }
  };

  const handleCustomDateChange = (startDate: string, endDate: string) => {
    setHistoryStartDate(startDate);
    setHistoryEndDate(endDate);
    fetchHistory(editedSegment.exercise_id, startDate, endDate);
  };

  // Render the active tab content
  const renderActiveTab = () => {
    switch (activeTab) {
      case "sets":
        return (
          <SetTab
            key={editedSegment.id}
            editedSegment={editedSegment}
            setEditedSegment={setEditedSegment}
            isWarmupSegment={editedSegment.is_warmup}
            onAutoSave={handleAutoSave}
            exerciseCategory={editedSegment.exercise_category}
            isTimed={editedSegment.exercise_is_timed}
          />
        );
      case "history":
        return (
          <HistoryTab
            history={exerciseHistory}
            loading={historyLoading}
            range={historyRange}
            customStartDate={historyStartDate}
            customEndDate={historyEndDate}
            onRangeChange={handleRangeChange}
            onCustomDateChange={handleCustomDateChange}
            totalCount={totalHistoryCount}
          />
        );
      case "stats":
        return (
          <StatsTab
            history={exerciseHistory}
            loading={historyLoading}
            range={historyRange}
            customStartDate={historyStartDate}
            customEndDate={historyEndDate}
            onRangeChange={handleRangeChange}
            onCustomDateChange={handleCustomDateChange}
          />
        );
      case "info":
        return <InfoTab exercise={exerciseDetail} loading={detailLoading} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        fullHeight
        title={
          <span className="flex items-center gap-2">
            {editedSegment.exercise_name || "New Exercise"}

            {/* SWAP EXERCISE BUTTON */}
            <Button
              onClick={() => setIsExercisePickerOpen(true)}
              className="btn-link"
              title="Swap exercise"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </Button>

            {/* DISABLE/ENABLE EXERCISE BUTTON */}
            <Button
              onClick={() => setIsDisableModalOpen(true)}
              className={isExerciseDisabled ? "btn-link btn-link-red" : "btn-link"}
              title={isExerciseDisabled ? "Enable exercise" : "Disable exercise"}
            >
              <Ban className="w-4 h-4" />
            </Button>
          </span>
        }
        disableClose={isDeleting}
        footer={
          <>
            <Button
              onClick={onRemove}
              disabled={isDeleting}
              className="btn-red mr-auto"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>

            {/* SAVE BUTTON */}
            <Button onClick={onClose} className="btn-blue">
              <Save className="w-4 h-4" />
              Save
            </Button>
          </>
        }
      >

        {/* TAB NAVIGATION */}
        <nav className="flex sm:space-x-1 px-2 border-b border-card" role="tablist">
          {tabs.map((tab) => (

            // TAB BUTTON
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button max-sm:flex-1 max-sm:justify-center ${activeTab === tab.id ? "tab-button-active" : ""}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* TAB CONTENT */}
        <div className="min-h-[60vh]" role="tabpanel" id={`${activeTab}-panel`} aria-labelledby={`${activeTab}-tab`}>
          {renderActiveTab()}
        </div>
      </Modal>

      {/* EXERCISE PICKER MODAL */}
      <ExercisePickerModal
        isOpen={isExercisePickerOpen}
        onClose={() => setIsExercisePickerOpen(false)}
        onSelect={(exercise) => handleExerciseChange(exercise.id)}
        exercises={exercises}
        onExerciseCreated={onExerciseCreated}
        onExerciseUpdated={onExerciseUpdated}
        currentExerciseId={editedSegment.exercise_id}
        targetExerciseId={editedSegment.target?.exercise_id}
      />

      {/* DISABLE/ENABLE EXERCISE MODAL */}
      <DisableExerciseModal
        isOpen={isDisableModalOpen}
        onClose={() => setIsDisableModalOpen(false)}
        onDisable={handleDisableExercise}
        onEnable={handleEnableExercise}
        exerciseName={editedSegment.exercise_name}
        isDisabled={isExerciseDisabled}
        isToggling={isTogglingDisable}
      />
    </>
  );
}
