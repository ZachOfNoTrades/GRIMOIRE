"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Dumbbell, History, Pencil } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { ExerciseWithMuscleGroups, MuscleGroup } from "../../../types/muscleGroup";
import { ExerciseHistoryEntry } from "../../../types/exercise";
import { formatDateLong, formatDuration } from "../../../utils/format";
import { calculateEstimatedOneRepMax } from "../../../utils/calc";
import HistoryTab from "../../session/[id]/HistoryTab";
import DisableExerciseModal from "./DisableExerciseModal";
import EnableExerciseModal from "./EnableExerciseModal";

export default function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [exercise, setExercise] = useState<ExerciseWithMuscleGroups | null>(null);
  const [allMuscleGroups, setAllMuscleGroups] = useState<MuscleGroup[]>([]);
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);

  // INPUT
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCategory, setEditedCategory] = useState("Strength");
  const [editedIsTimed, setEditedIsTimed] = useState(false);
  const [editedMuscleGroups, setEditedMuscleGroups] = useState<Array<{ muscleGroupId: string; isPrimary: boolean }>>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"stats" | "history">("history");
  const [scrollToSessionId, setScrollToSessionId] = useState<string | null>(null);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchExercise();
    fetchAllMuscleGroups();
    fetchHistory();
  }, [id]);

  const fetchExercise = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch exercise");
      }
      const data = await response.json();
      setExercise(data);
    } catch (error) {
      console.error("Error fetching exercise:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllMuscleGroups = async () => {
    try {
      const response = await fetch("/modules/golem/api/muscle-groups");
      if (!response.ok) {
        throw new Error("Failed to fetch muscle groups");
      }
      const data = await response.json();
      setAllMuscleGroups(data);
    } catch (error) {
      console.error("Error fetching muscle groups:", error);
    }
  };

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${id}/history`);
      if (!response.ok) {
        throw new Error("Failed to fetch exercise history");
      }
      const data = await response.json();
      setHistory(data.history);
    } catch (error) {
      console.error("Error fetching exercise history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // MUSCLE GROUP HANDLERS
  const handleToggleMuscleGroup = (muscleGroupId: string) => {
    setEditedMuscleGroups((prev) => {
      const existing = prev.find((mg) => mg.muscleGroupId === muscleGroupId);
      if (existing) {
        // Remove it
        const updated = prev.filter((mg) => mg.muscleGroupId !== muscleGroupId);
        // If we removed the primary and there are still groups, make the first one primary
        if (existing.isPrimary && updated.length > 0) {
          updated[0] = { ...updated[0], isPrimary: true };
        }
        return updated;
      } else {
        // Add it — if it's the first one, make it primary
        const isPrimary = prev.length === 0;
        return [...prev, { muscleGroupId, isPrimary }];
      }
    });
  };

  const handleSetPrimary = (muscleGroupId: string) => {
    setEditedMuscleGroups((prev) =>
      prev.map((mg) => ({
        ...mg,
        isPrimary: mg.muscleGroupId === muscleGroupId,
      }))
    );
  };

  // EDIT HANDLERS
  const handleStartEdit = () => {
    if (!exercise) return;
    setEditedName(exercise.name);
    setEditedDescription(exercise.description || "");
    setEditedCategory(exercise.category);
    setEditedIsTimed(exercise.is_timed);
    setEditedMuscleGroups(
      exercise.muscleGroups.map((mg) => ({
        muscleGroupId: mg.muscle_group_id,
        isPrimary: mg.is_primary,
      }))
    );
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName("");
    setEditedDescription("");
    setEditedCategory("Strength");
    setEditedIsTimed(false);
    setEditedMuscleGroups([]);
  };

  const handleSave = async () => {
    if (!exercise) return;
    if (!editedName.trim()) {
      toast.error("Exercise name is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedName.trim(),
          description: editedDescription.trim() || null,
          category: editedCategory,
          isTimed: editedIsTimed,
          muscleGroups: editedMuscleGroups,
        }),
      });

      if (response.status === 409) {
        toast.error("An exercise with this name already exists");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update exercise");
        return;
      }

      const updatedExercise = await response.json();
      setExercise(updatedExercise);
      setIsEditing(false);
      toast.success("Exercise saved");
    } catch (error) {
      toast.error("Failed to update exercise");
      console.error("Error saving exercise:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // DISABLE HANDLER
  const handleDisableExercise = async () => {
    setIsDisabling(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to disable exercise");
        return;
      }

      setExercise({ ...exercise!, is_disabled: true });
      setIsDisableModalOpen(false);
      toast.success("Exercise disabled");
    } catch (error) {
      toast.error("Failed to disable exercise");
      console.error("Error disabling exercise:", error);
    } finally {
      setIsDisabling(false);
    }
  };

  // ENABLE HANDLER
  const handleEnableExercise = async () => {
    setIsEnabling(true);
    try {
      const response = await fetch(`/modules/golem/api/exercises/${id}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to enable exercise");
        return;
      }

      setExercise({ ...exercise!, is_disabled: false });
      setIsEnableModalOpen(false);
      toast.success("Exercise enabled");
    } catch (error) {
      toast.error("Failed to enable exercise");
      console.error("Error enabling exercise:", error);
    } finally {
      setIsEnabling(false);
    }
  };

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <div className="loading-container py-12">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    );
  }

  // NOT FOUND PLACEHOLDER
  if (notFound || !exercise) {
    return (
      <div className="page">
        <main className="page-container">
          <p className="text-page-subtitle text-center py-8">Exercise not found</p>
        </main>
      </div>
    );
  }

  return (

    // BACKGROUND
    <div className="page">

      <Toaster />

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/golem/ui/exercises")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div className="flex items-center gap-3">
            <h1 className="text-page-title">{exercise.name}</h1>
          </div>
        </div>

        <div className="card-container">

          {/* EXERCISE DETAILS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <Dumbbell className="w-5 h-5" />
                Exercise Details
              </h2>

              {/* ACTIONS */}
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    {/* CANCEL BUTTON */}
                    <Button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="btn-link"
                    >
                      Cancel
                    </Button>

                    {/* SAVE BUTTON */}
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !editedName.trim()}
                      className="btn-blue"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* DISABLE / ENABLE BUTTON */}
                    {exercise.is_disabled ? (
                      <Button
                        onClick={() => setIsEnableModalOpen(true)}
                        className="btn-link btn-link-green"
                      >
                        Enable
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setIsDisableModalOpen(true)}
                        className="btn-link btn-link-red"
                      >
                        Disable
                      </Button>
                    )}

                    {/* EDIT BUTTON */}
                    <Button
                      onClick={handleStartEdit}
                      className="btn-link"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">
              {isEditing ? (
                <>
                  {/* NAME INPUT */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="input-field"
                      autoCapitalize="words"
                    />
                  </div>

                  {/* DESCRIPTION INPUT */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="input-field min-h-[80px] resize-y"
                      placeholder="Optional description..."
                      rows={3}
                    />
                  </div>

                  {/* CATEGORY SELECT */}
                  <div>
                    <label className="text-secondary">Category</label>
                    <select
                      value={editedCategory}
                      onChange={(e) => setEditedCategory(e.target.value)}
                      className="input-field"
                    >
                      <option value="Strength">Strength</option>
                      <option value="Cardio">Cardio</option>
                      <option value="Mobility">Mobility</option>
                    </select>
                  </div>

                  {/* TIMED EXERCISE TOGGLE */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is-timed"
                      checked={editedIsTimed}
                      onChange={(e) => setEditedIsTimed(e.target.checked)}
                      className="checkbox"
                    />
                    <label htmlFor="is-timed" className="text-secondary cursor-pointer">
                      Timed Exercise
                    </label>
                  </div>

                  {/* MUSCLE GROUPS TABLE */}
                  <div>
                    <label className="text-secondary">Muscle Groups</label>
                    <div className="table-container mt-1">
                      <table className="table">

                        {/* TABLE HEADERS */}
                        <thead className="table-header">
                          <tr className="table-header-row">
                            <th className="table-header-cell w-0">Selected</th>
                            <th className="table-header-cell w-0 whitespace-nowrap">Muscle Group</th>
                            <th className="table-header-cell !text-center w-0">Primary</th>
                            <th className="table-header-cell w-full"></th>
                          </tr>
                        </thead>

                        {/* TABLE ROWS */}
                        <tbody className="table-body">
                          {allMuscleGroups.map((muscleGroup) => {
                            const assignment = editedMuscleGroups.find(
                              (mg) => mg.muscleGroupId === muscleGroup.id
                            );
                            const isAssigned = !!assignment;
                            const isPrimary = assignment?.isPrimary ?? false;

                            return (
                              // MUSCLE GROUP ROW
                              <tr key={muscleGroup.id} className="table-row">

                                {/* SELECTED CHECKBOX */}
                                <td className="table-cell">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={() => handleToggleMuscleGroup(muscleGroup.id)}
                                    className="checkbox"
                                  />
                                </td>

                                {/* NAME */}
                                <td className="table-cell">{muscleGroup.name}</td>

                                {/* PRIMARY RADIO */}
                                <td className="table-cell text-center">
                                  {isAssigned && (
                                    <input
                                      type="radio"
                                      name="primaryMuscleGroup"
                                      checked={isPrimary}
                                      onChange={() => handleSetPrimary(muscleGroup.id)}
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                  )}
                                </td>

                                {/* SPACER */}
                                <td></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* NAME */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <p className="text-primary">{exercise.name}</p>
                  </div>

                  {/* DESCRIPTION */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <p className="text-primary">{exercise.description || "—"}</p>
                  </div>

                  {/* CATEGORY */}
                  <div>
                    <label className="text-secondary">Category</label>
                    <p className="text-primary">{exercise.category}</p>
                  </div>

                  {/* MUSCLE GROUPS */}
                  <div>
                    <label className="text-secondary">Muscle Groups</label>
                    {exercise.muscleGroups.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {exercise.muscleGroups.map((mg) => (
                          // MUSCLE GROUP BADGE
                          <span
                            key={mg.id}
                            className={`badge ${mg.is_primary ? "badge-blue" : "badge-gray"}`}
                          >
                            {mg.muscle_group_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-primary">—</p>
                    )}
                  </div>

                  {/* CREATED DATE */}
                  <div>
                    <label className="text-secondary">Created</label>
                    <p className="text-primary">{formatDateLong(exercise.created_at)}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* STATS / HISTORY CARD */}
          <div className="card">

            {/* TAB HEADERS */}
            <nav className="flex space-x-4 px-3 mb-2 border-b border-card" role="tablist">

              {/* HISTORY TAB */}
              <button
                className={`tab-button ${selectedTab === "history" ? "tab-button-active" : ""}`}
                onClick={() => setSelectedTab("history")}
                role="tab"
                aria-selected={selectedTab === "history"}
                aria-controls="history-panel"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>

              {/* STATS TAB */}
              <button
                className={`tab-button ${selectedTab === "stats" ? "tab-button-active" : ""}`}
                onClick={() => setSelectedTab("stats")}
                role="tab"
                aria-selected={selectedTab === "stats"}
                aria-controls="stats-panel"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Stats</span>
              </button>
            </nav>

            {/* TAB CONTENT */}
            <div className="card-content" role="tabpanel" id={`${selectedTab}-panel`}>
              {selectedTab === "stats" ? (

                // STATS TAB CONTENT
                (() => {
                  if (isHistoryLoading) {
                    return <div className="loading-container py-4"><div className="loading-spinner" /></div>;
                  }

                  if (exercise.is_timed) {
                    // Timed exercise stats (with session_id for navigation)
                    const timedSets = history.flatMap((entry) =>
                      entry.sets
                        .filter((set) => !set.is_warmup && set.time_seconds != null && set.time_seconds > 0)
                        .map((set) => ({ ...set, session_id: entry.session_id }))
                    );

                    if (timedSets.length === 0) {
                      return <p className="text-page-subtitle text-center py-4">No stats available</p>;
                    }

                    // Longest Duration
                    const longestDuration = timedSets.reduce((best, set) =>
                      (set.time_seconds ?? 0) > (best.time_seconds ?? 0) ? set : best
                    );

                    return (
                      <div className="stat-section">

                        {/* LONGEST DURATION */}
                        <div
                          className="stat-card cursor-pointer"
                          onClick={() => { setScrollToSessionId(longestDuration.session_id); setSelectedTab("history"); }}
                        >
                          <p className="stat-label">Longest Duration</p>
                          <p className="stat-value">{formatDuration(longestDuration.time_seconds!)}</p>
                        </div>
                      </div>
                    );
                  }

                  // Rep-based exercise stats (with session_id for navigation)
                  const workingSets = history.flatMap((entry) =>
                    entry.sets
                      .filter((set) => !set.is_warmup && set.weight > 0 && set.reps != null && set.reps > 0)
                      .map((set) => ({ ...set, session_id: entry.session_id }))
                  );

                  if (workingSets.length === 0) {
                    return <p className="text-page-subtitle text-center py-4">No stats available</p>;
                  }

                  // Estimated 1RM from best working set by Epley
                  const bestOneRepMaxSet = workingSets.reduce((best, set) =>
                    calculateEstimatedOneRepMax(set.weight, set.reps!) > calculateEstimatedOneRepMax(best.weight, best.reps!) ? set : best
                  );
                  const bestOneRepMax = calculateEstimatedOneRepMax(bestOneRepMaxSet.weight, bestOneRepMaxSet.reps!);

                  // Best volume set (highest weight × reps)
                  const bestVolumeSet = workingSets.reduce((best, set) =>
                    set.weight * (set.reps ?? 0) > best.weight * (best.reps ?? 0) ? set : best
                  );

                  // Best weight set (heaviest weight lifted)
                  const bestWeightSet = workingSets.reduce((best, set) =>
                    set.weight > best.weight ? set : best
                  );

                  return (
                    <div className="stat-section">

                      {/* ESTIMATED 1RM */}
                      <div
                        className="stat-card cursor-pointer"
                        onClick={() => { setScrollToSessionId(bestOneRepMaxSet.session_id); setSelectedTab("history"); }}
                      >
                        <p className="stat-label">e1RM</p>
                        <p className="stat-value">{bestOneRepMax} lbs</p>
                      </div>

                      {/* BEST VOLUME SET */}
                      <div
                        className="stat-card cursor-pointer"
                        onClick={() => { setScrollToSessionId(bestVolumeSet.session_id); setSelectedTab("history"); }}
                      >
                        <p className="stat-label">Best Volume Set</p>
                        <p className="stat-value">{bestVolumeSet.weight} x {bestVolumeSet.reps}</p>
                      </div>

                      {/* BEST WEIGHT SET */}
                      <div
                        className="stat-card cursor-pointer"
                        onClick={() => { setScrollToSessionId(bestWeightSet.session_id); setSelectedTab("history"); }}
                      >
                        <p className="stat-label">Best Weight Set</p>
                        <p className="stat-value">{bestWeightSet.weight} x {bestWeightSet.reps}</p>
                      </div>
                    </div>
                  );
                })()
              ) : (

                // HISTORY TAB CONTENT
                <HistoryTab
                  history={history}
                  loading={isHistoryLoading}
                  highlightSessionId={scrollToSessionId ?? undefined}
                  onSessionClick={(sessionId) => router.push(`/modules/golem/ui/session/${sessionId}`)}
                />
              )}
            </div>
          </div>
        </div>

        {/* DISABLE EXERCISE MODAL */}
        <DisableExerciseModal
          isOpen={isDisableModalOpen}
          onClose={() => setIsDisableModalOpen(false)}
          onConfirm={handleDisableExercise}
          exerciseName={exercise.name}
          isDisabling={isDisabling}
        />

        {/* ENABLE EXERCISE MODAL */}
        <EnableExerciseModal
          isOpen={isEnableModalOpen}
          onClose={() => setIsEnableModalOpen(false)}
          onConfirm={handleEnableExercise}
          exerciseName={exercise.name}
          isEnabling={isEnabling}
        />
      </main>
    </div>
  );
}
