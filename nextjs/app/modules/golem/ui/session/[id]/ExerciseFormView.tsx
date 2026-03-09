"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ExerciseSummary } from "../../../types/exercise";
import { MuscleGroup } from "../../../types/muscleGroup";

interface ExerciseFormViewProps {
  exercise?: ExerciseSummary;
  onSaved: (exercise: ExerciseSummary, isNew: boolean) => void;
}

export default function ExerciseFormView({
  exercise,
  onSaved,
}: ExerciseFormViewProps) {

  const isEditing = !!exercise;

  // DATA
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Strength");
  const [assignments, setAssignments] = useState<Map<string, "primary" | "secondary">>(new Map());

  // STATE
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch muscle groups and exercise detail on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const muscleGroupsResponse = await fetch("/modules/golem/api/muscle-groups");
        if (muscleGroupsResponse.ok) {
          setMuscleGroups(await muscleGroupsResponse.json());
        }

        // If editing, fetch exercise detail with muscle groups
        if (exercise) {
          const exerciseResponse = await fetch(`/modules/golem/api/exercises/${exercise.id}`);
          if (exerciseResponse.ok) {
            const detail = await exerciseResponse.json();
            setName(detail.name);
            setDescription(detail.description ?? "");
            setCategory(detail.category);

            const muscleGroupMap = new Map<string, "primary" | "secondary">();
            for (const muscleGroup of detail.muscleGroups) {
              muscleGroupMap.set(muscleGroup.muscle_group_id, muscleGroup.is_primary ? "primary" : "secondary");
            }
            setAssignments(muscleGroupMap);
          }
        }
      } catch (err) {
        console.error("Error loading form data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [exercise]);

  // Toggle muscle group: if no primary exists, selection becomes primary; otherwise secondary. Tap again to deselect.
  const toggleMuscleGroup = (muscleGroupId: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      if (next.has(muscleGroupId)) {
        next.delete(muscleGroupId);
      } else {
        const hasPrimary = Array.from(next.values()).includes("primary");
        next.set(muscleGroupId, hasPrimary ? "secondary" : "primary");
      }
      return next;
    });
  };

  // Build muscle group arrays from assignments
  const buildMuscleArrays = () => {
    const primaryMuscles: string[] = [];
    const secondaryMuscles: string[] = [];
    for (const [muscleGroupId, role] of assignments) {
      const muscleGroup = muscleGroups.find((mg) => mg.id === muscleGroupId);
      if (muscleGroup) {
        if (role === "primary") primaryMuscles.push(muscleGroup.name);
        else secondaryMuscles.push(muscleGroup.name);
      }
    }
    return { primaryMuscles, secondaryMuscles };
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Exercise name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const muscleGroupPayload = Array.from(assignments.entries()).map(([muscleGroupId, role]) => ({
        muscleGroupId,
        isPrimary: role === "primary",
      }));
      const { primaryMuscles, secondaryMuscles } = buildMuscleArrays();

      if (isEditing) {
        // Update existing exercise
        const response = await fetch(`/modules/golem/api/exercises/${exercise.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            category,
            muscleGroups: muscleGroupPayload,
          }),
        });

        if (response.status === 409) {
          setError("An exercise with this name already exists");
          return;
        }
        if (response.status === 404) {
          setError("Exercise not found");
          return;
        }
        if (!response.ok) throw new Error("Failed to update exercise");

        const summary: ExerciseSummary = {
          ...exercise,
          name: name.trim(),
          category,
          primary_muscles: primaryMuscles,
          secondary_muscles: secondaryMuscles,
        };
        onSaved(summary, false);
      } else {
        // Create new exercise
        const createResponse = await fetch("/modules/golem/api/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            category,
          }),
        });

        if (createResponse.status === 409) {
          setError("An exercise with this name already exists");
          return;
        }
        if (!createResponse.ok) throw new Error("Failed to create exercise");

        const created = await createResponse.json();

        // Assign muscle groups if any were selected
        if (muscleGroupPayload.length > 0) {
          await fetch(`/modules/golem/api/exercises/${created.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              category,
              muscleGroups: muscleGroupPayload,
            }),
          });
        }

        const summary: ExerciseSummary = {
          id: created.id,
          name: created.name,
          category: created.category ?? category,
          primary_muscles: primaryMuscles,
          secondary_muscles: secondaryMuscles,
          estimated_one_rep_max: null,
          last_used_at: null,
        };
        onSaved(summary, true);
      }
    } catch (err) {
      console.error("Error saving exercise:", err);
      setError("Failed to save exercise");
    } finally {
      setIsSaving(false);
    }
  };

  // LOADING PLACEHOLDER
  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* FORM FIELDS */}
      <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 scrollbar-hide pr-2">

        {/* NAME INPUT */}
        <div className="flex flex-col gap-1">
          <label className="text-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bench Press"
            className="input-field"
            autoCapitalize="words"
            autoFocus
          />
        </div>

        {/* DESCRIPTION INPUT */}
        <div className="flex flex-col gap-1">
          <label className="text-label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className="input-field min-h-[80px] resize-y"
            rows={3}
          />
        </div>

        {/* CATEGORY SELECT */}
        <div className="flex flex-col gap-1">
          <label className="text-label">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field"
          >
            <option value="Strength">Strength</option>
            <option value="Cardio">Cardio</option>
            <option value="Mobility">Mobility</option>
          </select>
        </div>

        {/* MUSCLE GROUPS */}
        <div className="flex flex-col gap-2">
          <label className="text-label">Muscle Groups</label>
          <p className="text-xs text-secondary">First selected is primary, others are secondary</p>
          <div className="flex flex-wrap gap-2">
            {muscleGroups.map((muscleGroup) => {
              const role = assignments.get(muscleGroup.id);
              const badgeClass = role === "primary"
                ? "badge-success"
                : role === "secondary"
                  ? "badge-default"
                  : "badge-muted";
              return (
                <button
                  key={muscleGroup.id}
                  onClick={() => toggleMuscleGroup(muscleGroup.id)}
                  className={`${badgeClass} cursor-pointer`}
                >
                  {muscleGroup.name}
                  {role === "primary" && <span className="text-[10px] uppercase ml-1">(P)</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-error mt-2">{error}</p>
      )}

      {/* SAVE BUTTON */}
      <div className="pt-4">
        <Button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="btn-primary w-full"
        >
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Exercise"}
        </Button>
      </div>
    </div>
  );
}
