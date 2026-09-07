"use client"

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeftRight, Pencil, Save, Ban, ChevronLeft, ChevronRight, X, LayoutGrid } from "lucide-react";
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
import { resolveDistanceUnit, DistanceType } from "../../../utils/units";
import SetTab from "./SetTab";
import HistoryTab from "./HistoryTab";
import StatsTab from "./StatsTab";
import InfoTab from "./InfoTab";
import { useWindowCache } from "@/lib/useWindowCache";

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
  // Navigation — pass sibling segments to enable swipe/arrow navigation between them.
  // Pass empty array when opening a new (unsaved) segment to disable navigation.
  navigationSegments?: SegmentWithSets[];
  onNavigate?: (nextSegment: SegmentWithSets) => void;
  // The user's preferred distance display units per band (from their golem profile). Used to render/convert
  // the per-set distance input for distance-tracking exercises.
  distanceUnits?: { short: string | null; long: string | null };
  // Fired when a working set is marked complete, so the page can start the rest timer.
  onSetCompleted?: () => void;
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
  navigationSegments = [],
  onNavigate,
  distanceUnits,
  onSetCompleted,
}: EditSegmentModalProps) {

  // INPUT
  const [editedSegment, setEditedSegment] = useState<SegmentWithSets | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("6m");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  // DATA
  // History is cached per (exercise, window) by useWindowCache below; this holds
  // WHICH exercise the range filter currently describes. It lags the edited
  // segment by one render on an exercise swap — deliberately, so the swap's
  // filter reset lands before any request is made for the new exercise.
  const [historyExerciseId, setHistoryExerciseId] = useState<string | null>(null);
  const [exerciseDetail, setExerciseWithMuscleGroups] = useState<ExerciseWithMuscleGroups | null>(null);

  // STATE
  const [activeTab, setActiveTab] = useState("sets");
  const [highlightSessionId, setHighlightSessionId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const [isExercisePickerEditMode, setIsExercisePickerEditMode] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isTogglingDisable, setIsTogglingDisable] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);

  // SWIPE TRACKING
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);

  // DERIVED
  const isExerciseDisabled = exerciseDetail?.is_disabled ?? false;
  const currentNavIndex = segment ? navigationSegments.findIndex((s) => s.id === segment.id) : -1;
  const canNavigate = currentNavIndex >= 0 && navigationSegments.length > 1;
  const hasPrev = canNavigate && currentNavIndex > 0;
  const hasNext = canNavigate && currentNavIndex < navigationSegments.length - 1;

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

  // Fetch one exercise's history for one window. The cache key packs both, since
  // swapping the exercise and changing the range are the same kind of change to
  // what's on screen.
  const fetchHistory = useCallback(async (cacheKey: string) => {
    const [exerciseId, startDate, endDate] = cacheKey.split("|");
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const queryString = params.toString();
    const url = `/modules/golem/api/exercises/${exerciseId}/history${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch history");
    const data = await response.json();
    return {
      history: (Array.isArray(data.history) ? data.history : []) as ExerciseHistoryEntry[],
      totalCount: Number(data.totalCount ?? 0),
    };
  }, []);

  // Resolved history window. The custom range passes its own bounds through —
  // empty until both are picked, which reads as all-time and so shares the "All"
  // preset's cache entry.
  const { startDate: historyWindowStart, endDate: historyWindowEnd } = historyRange === "custom"
    ? { startDate: historyStartDate, endDate: historyEndDate }
    : getDateRangeParams(historyRange);
  const historyKey = historyExerciseId
    ? `${historyExerciseId}|${historyWindowStart}|${historyWindowEnd}`
    : null;

  // Warm the other presets for the SAME exercise behind the active one, so
  // 6M → 1Y → All swaps the list in one frame instead of blanking it.
  const historyPrefetchKeys = useMemo(() => {
    if (!historyExerciseId) return [];
    return (["6m", "1y", "all"] as HistoryRange[]).map((preset) => {
      const { startDate, endDate } = getDateRangeParams(preset);
      return `${historyExerciseId}|${startDate}|${endDate}`;
    });
  }, [historyExerciseId]);

  const { data: historyData, dataKey: historyDataKey, isLoading: historyIdle, isRefreshing: historyWarming } =
    useWindowCache(historyKey, fetchHistory, { prefetchKeys: historyPrefetchKeys });

  // Holding the PREVIOUS window's rows while a new one loads is the whole point
  // for a range change — but NOT across an exercise swap, where the old
  // exercise's sessions would simply be the wrong data. Only reuse a cached
  // payload that belongs to the exercise on screen; otherwise fall back to the
  // loading placeholder (or, once the fetch has settled and failed, the empty state).
  const historyMatchesExercise = !!historyDataKey && !!historyExerciseId && historyDataKey.startsWith(`${historyExerciseId}|`);
  const exerciseHistory = historyMatchesExercise && historyData ? historyData.history : [];
  const totalHistoryCount = historyMatchesExercise && historyData ? historyData.totalCount : 0;
  const historyLoading = !historyMatchesExercise && (historyIdle || historyWarming);

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

      // Only reset tab/filter state on initial open — preserve them during swipe navigation
      const isInitialOpen = !wasOpenRef.current;
      wasOpenRef.current = true;

      if (isInitialOpen) {
        setActiveTab("sets");
        setHighlightSessionId(null);
        setHistoryRange("6m");
        setHistoryStartDate("");
        setHistoryEndDate("");
      }

      // Point the history filter at this exercise; the cache below loads it (and
      // warms the other ranges) on its own.
      setHistoryExerciseId(segment.exercise_id);
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
            distance: null,
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
            distance: null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }
      }

      setEditedSegment(clonedSegment);
    }

    // Reset the "was open" flag when modal closes so next open is treated as initial
    if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen, segment]);

  // Clear slide direction after animation completes so a subsequent swipe can retrigger it
  useEffect(() => {
    if (slideDirection === null) return;
    const timer = setTimeout(() => setSlideDirection(null), 260);
    return () => clearTimeout(timer);
  }, [slideDirection, activeTab]);

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
    setHistoryExerciseId(currentExerciseId);
    fetchDetail(currentExerciseId);
  }, [currentExerciseId]);

  if (!editedSegment) return null;

  // Flush latest segment state before closing so notes and other edits are captured
  const handleClose = () => {
    onClose();
  };

  // Navigate to the previous/next segment in the navigation list
  const handleNavigatePrev = () => {
    if (!hasPrev || !onNavigate || !editedSegment) return;
    // Flush current edits before switching
    onSave(editedSegment);
    onNavigate(navigationSegments[currentNavIndex - 1]);
  };

  const handleNavigateNext = () => {
    if (!hasNext || !onNavigate || !editedSegment) return;
    // Flush current edits before switching
    onSave(editedSegment);
    onNavigate(navigationSegments[currentNavIndex + 1]);
  };

  // TAB SWIPE HANDLERS — horizontal swipe cycles through tabs (Sets → History → Stats → Info)
  const handleSwipeToTab = (direction: "prev" | "next") => {
    const currentTabIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentTabIndex < 0) return;

    const targetIndex = direction === "next" ? currentTabIndex + 1 : currentTabIndex - 1;
    if (targetIndex < 0 || targetIndex >= tabs.length) return; // clamp at edges, no wrap

    setSlideDirection(direction === "next" ? "left" : "right");
    setActiveTab(tabs[targetIndex].id);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    swipeStartXRef.current = event.touches[0].clientX;
    swipeStartYRef.current = event.touches[0].clientY;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;

    const endX = event.changedTouches[0].clientX;
    const endY = event.changedTouches[0].clientY;
    const deltaX = endX - swipeStartXRef.current;
    const deltaY = endY - swipeStartYRef.current;

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    // Require a predominantly horizontal swipe of at least 60px
    const minSwipeDistance = 60;
    if (Math.abs(deltaX) < minSwipeDistance) return;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return; // vertical swipe, ignore

    handleSwipeToTab(deltaX > 0 ? "prev" : "next");
  };

  const handleExerciseChange = (exercise: ExerciseSummary) => {
    const updatedSegment = {
      ...editedSegment,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_category: exercise.category,
      exercise_is_timed: exercise.is_timed,
      exercise_distance_type: exercise.distance_type,
    };
    setEditedSegment(updatedSegment);
    onSave(updatedSegment);
  };

  // Wrap onExerciseUpdated to also sync the segment's exercise properties
  const handleExerciseUpdated = (summary: ExerciseSummary) => {
    if (editedSegment && summary.id === editedSegment.exercise_id) {
      const updatedSegment = {
        ...editedSegment,
        exercise_name: summary.name,
        exercise_category: summary.category,
        exercise_is_timed: summary.is_timed,
        exercise_distance_type: summary.distance_type,
      };
      setEditedSegment(updatedSegment);
      onSave(updatedSegment);
      fetchDetail(editedSegment.exercise_id);
    }
    onExerciseUpdated(summary);
  };

  const handleAutoSave = (updatedSegment: SegmentWithSets) => {
    if (!updatedSegment.exercise_id) return;
    onSave(updatedSegment);
  };

  // Both handlers only move the filter — the cache reacts to the resolved window,
  // serving an already-warmed range in the same frame as the change.
  const handleRangeChange = (newRange: HistoryRange) => {
    setHistoryRange(newRange);
    if (newRange !== "custom") {
      setHistoryStartDate("");
      setHistoryEndDate("");
    }
  };

  const handleCustomDateChange = (startDate: string, endDate: string) => {
    setHistoryStartDate(startDate);
    setHistoryEndDate(endDate);
  };

  // Resolve the display unit for this exercise's distance band from the user's preferences.
  const distanceType = (editedSegment.exercise_distance_type === "short" || editedSegment.exercise_distance_type === "long")
    ? (editedSegment.exercise_distance_type as DistanceType)
    : null;
  const resolvedDistanceUnit = distanceType
    ? resolveDistanceUnit(distanceType, distanceUnits?.short, distanceUnits?.long)
    : undefined;

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
            distanceType={editedSegment.exercise_distance_type}
            distanceUnit={resolvedDistanceUnit}
            onSetCompleted={onSetCompleted}
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
            highlightSessionId={highlightSessionId ?? undefined}
            distanceUnit={resolvedDistanceUnit}
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
            onNavigateToSession={(targetSessionId) => {
              setHighlightSessionId(targetSessionId);
              setActiveTab("history");
            }}
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
        onClose={handleClose}
        fullHeight
        title={
          // EXERCISE NAME (full width, truncates on overflow)
          <span className="truncate">{editedSegment.exercise_name || "New Exercise"}</span>
        }
        modalActions={
          // CONTROLS ROW — nav + exercise actions + close, all on a single top line
          <div className="flex items-center gap-1 flex-wrap justify-end">

            {/* SEGMENT NAVIGATION GROUP */}
            {canNavigate && (
              <>

                {/* PREV SEGMENT BUTTON */}
                <Button
                  onClick={handleNavigatePrev}
                  disabled={!hasPrev}
                  className="btn-link"
                  title="Previous exercise"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>

                {/* SEGMENT COUNTER */}
                <span className="text-secondary text-sm tabular-nums px-1">
                  {currentNavIndex + 1} / {navigationSegments.length}
                </span>

                {/* NEXT SEGMENT BUTTON */}
                <Button
                  onClick={handleNavigateNext}
                  disabled={!hasNext}
                  className="btn-link"
                  title="Next exercise"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </>
            )}

            {/* EDIT EXERCISE BUTTON */}
            <Button
              onClick={() => {
                setIsExercisePickerEditMode(true);
                setIsExercisePickerOpen(true);
              }}
              className="btn-link"
              title="Edit exercise"
            >
              <Pencil className="w-4 h-4" />
            </Button>

            {/* SWAP EXERCISE BUTTON */}
            <Button
              onClick={() => {
                setIsExercisePickerEditMode(false);
                setIsExercisePickerOpen(true);
              }}
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

            {/* CLOSE BUTTON */}
            <Button
              onClick={handleClose}
              disabled={isDeleting}
              className="btn-link"
              title="Close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
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
            <Button onClick={handleClose} className="btn-blue">
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

        {/* TAB CONTENT — flex column so the slot-provenance link sits at the bottom of the
            existing min-height (uses the empty space rather than adding scroll). */}
        <div
          key={`${activeTab}-${slideDirection ?? "stable"}`}
          className={`min-h-[60vh] flex flex-col ${slideDirection === "left" ? "view-slide-right" : slideDirection === "right" ? "view-slide-left" : ""}`}
          role="tabpanel"
          id={`${activeTab}-panel`}
          aria-labelledby={`${activeTab}-tab`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {renderActiveTab()}

          {/* SLOT PROVENANCE — slot role + progression model, linking to the day archetype that generated
              this exercise. Rendered as an anchor (Link) so middle/cmd-click opens it in a new tab; on a
              normal click the live-saved edits' in-flight PUT still completes (client nav doesn't abort it). */}
          {editedSegment.target?.slot_role && editedSegment.target.day_archetype_id && (
            <Link
              href={`/modules/golem/ui/archetypes?archetype=${editedSegment.target.day_archetype_id}`}
              className="btn-link mt-auto pt-3 w-full justify-center text-secondary text-sm gap-1.5"
              title="Open the day archetype this exercise was generated from"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="capitalize">{editedSegment.target.slot_role}</span>
              {editedSegment.target.progression_model && (
                <span>· {editedSegment.target.progression_model.replace(/_/g, " ")}</span>
              )}
            </Link>
          )}
        </div>
      </Modal>

      {/* EXERCISE PICKER MODAL */}
      <ExercisePickerModal
        isOpen={isExercisePickerOpen}
        onClose={() => setIsExercisePickerOpen(false)}
        onSelect={(exercise) => handleExerciseChange(exercise)}
        exercises={exercises}
        onExerciseCreated={onExerciseCreated}
        onExerciseUpdated={handleExerciseUpdated}
        currentExerciseId={editedSegment.exercise_id}
        targetExerciseId={editedSegment.target?.exercise_id}
        editMode={isExercisePickerEditMode}
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
