"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Dumbbell, History, Pencil } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { ExerciseWithMuscleGroups, MuscleGroup } from "../../../types/muscleGroup";
import { ExerciseHistoryEntry } from "../../../types/exercise";
import { formatDateLong, formatDateShortWithYear } from "../../../utils/format";
import { calculateEstimatedOneRepMax } from "../../../utils/calc";
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
      const response = await fetch(`/modules/west/api/exercises/${id}`);
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
      const response = await fetch("/modules/west/api/muscle-groups");
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
      const response = await fetch(`/modules/west/api/exercises/${id}/history`);
      if (!response.ok) {
        throw new Error("Failed to fetch exercise history");
      }
      const data = await response.json();
      setHistory(data);
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
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedName.trim(),
          description: editedDescription.trim() || null,
          category: editedCategory,
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
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
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
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
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
            onClick={() => router.push("/modules/west/ui/exercises")}
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
                      className="btn-primary"
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
                        className="btn-link btn-link-success"
                      >
                        Enable
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setIsDisableModalOpen(true)}
                        className="btn-link btn-link-delete"
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
                      autoFocus
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
                            className={`badge ${mg.is_primary ? "badge-default" : "badge-muted"}`}
                          >
                            {mg.muscle_group_name}{mg.is_primary && " (Primary)"}
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

                  // Compute stats from history
                  const workingSets = history.flatMap((entry) =>
                    entry.sets.filter((set) => !set.is_warmup && set.weight > 0 && set.reps > 0)
                  );

                  if (workingSets.length === 0) {
                    return <p className="text-page-subtitle text-center py-4">No stats available</p>;
                  }

                  // Estimated 1RM from best working set by Epley
                  const bestOneRepMax = Math.max(
                    ...workingSets.map((set) => calculateEstimatedOneRepMax(set.weight, set.reps))
                  );

                  // Best volume set (highest weight × reps)
                  const bestVolumeSet = workingSets.reduce((best, set) =>
                    set.weight * set.reps > best.weight * best.reps ? set : best
                  );

                  // Best weight set (heaviest weight lifted)
                  const bestWeightSet = workingSets.reduce((best, set) =>
                    set.weight > best.weight ? set : best
                  );

                  return (
                    <div className="stat-section">

                      {/* ESTIMATED 1RM */}
                      <div className="stat-card">
                        <p className="stat-label">e1RM</p>
                        <p className="stat-value">{bestOneRepMax} lbs</p>
                      </div>

                      {/* BEST VOLUME SET */}
                      <div className="stat-card">
                        <p className="stat-label">Best Volume Set</p>
                        <p className="stat-value">{bestVolumeSet.weight} x {bestVolumeSet.reps}</p>
                      </div>

                      {/* BEST WEIGHT SET */}
                      <div className="stat-card">
                        <p className="stat-label">Best Weight Set</p>
                        <p className="stat-value">{bestWeightSet.weight} x {bestWeightSet.reps}</p>
                      </div>
                    </div>
                  );
                })()
              ) : (

                // HISTORY TAB CONTENT
                isHistoryLoading ? (

                  // LOADING PLACEHOLDER
                  <div className="loading-container py-4">
                    <div className="loading-spinner" />
                  </div>
                ) : history.length === 0 ? (

                  // EMPTY PLACEHOLDER
                  <p className="text-page-subtitle text-center py-4">No session history found</p>
                ) : (

                  // SESSION SUB-CARDS
                  <div className="flex flex-col gap-3">
                    {history.map((entry) => (

                      // SESSION SUB-CARD
                      <div
                        key={entry.session_id}
                        className="card cursor-pointer"
                        onClick={() => router.push(`/modules/west/ui/session/${entry.session_id}`)}
                      >

                        {/* SUB-CARD CONTENT */}
                        <div className="card-content !gap-1">

                          {/* SESSION NAME AND DATE */}
                          <div className="flex items-baseline justify-between gap-4">
                            <h3 className="text-h2">{entry.session_name}</h3>

                            {/* DATE */}
                            <span className="text-secondary text-sm whitespace-nowrap">
                              {formatDateShortWithYear(entry.started_at!)}
                            </span>
                          </div>

                          {/* PROGRAM NAME */}
                          {entry.program_name && (
                            <p className="text-secondary text-sm">{entry.program_name}</p>
                          )}

                          {/* SETS LIST */}
                          <div className="flex flex-col gap-0.5 mt-1">
                            {entry.sets.map((set, index) => (

                              // SET LINE
                              <p key={index} className={`text-sm ${set.is_warmup ? "text-secondary" : "text-primary"}`}>
                                {set.weight > 0 ? `${set.weight}` : "BW"} x {set.reps}
                                {set.rpe != null && <span className="text-secondary"> @{set.rpe}</span>}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
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
