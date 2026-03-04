"use client"

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import SubModal from "@/components/SubModal";
import { ExerciseSummary } from "../../../types/exercise";

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: ExerciseSummary) => void;
  exercises: ExerciseSummary[];
  onExerciseCreated: (exercise: ExerciseSummary) => void;
}

const OTHER_GROUP = "Other";

export default function ExercisePickerModal({
  isOpen,
  onClose,
  onSelect,
  exercises,
  onExerciseCreated,
}: ExercisePickerModalProps) {

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");

  // STATE
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMuscleGroup, setActiveMuscleGroup] = useState<string | null>(null);

  // REFS
  const listRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isScrollingToRef = useRef(false);

  // DERIVED
  const isSearching = searchQuery.length > 0;
  const filteredExercises = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setNewExerciseName("");
      setIsAdding(false);
      setError(null);
      setActiveMuscleGroup(null);
    }
  }, [isOpen]);

  const groupedExercises = (() => {
    const groups = new Map<string, ExerciseSummary[]>();

    for (const ex of filteredExercises) {
      const primaryMuscle = ex.primary_muscles.length > 0
        ? ex.primary_muscles[0]
        : OTHER_GROUP;

      if (!groups.has(primaryMuscle)) {
        groups.set(primaryMuscle, []);
      }
      groups.get(primaryMuscle)!.push(ex);
    }

    // Sort group names alphabetically, with "Other" at the end
    const sortedEntries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === OTHER_GROUP) return 1;
      if (b === OTHER_GROUP) return -1;
      return a.localeCompare(b);
    });

    return sortedEntries;
  })();

  const muscleGroupNames = groupedExercises.map(([name]) => name);

  // Scroll the tab bar so the active tab's left edge aligns with the container's left edge
  const scrollTabIntoView = useCallback((groupName: string) => {
    const tabEl = tabRefs.current.get(groupName);
    if (tabEl && tabBarRef.current) {
      const tabLeft = tabEl.getBoundingClientRect().left;
      const barLeft = tabBarRef.current.getBoundingClientRect().left;
      tabBarRef.current.scrollLeft += tabLeft - barLeft;
    }
  }, []);

  // Handle tab click — scroll to section
  const handleTabClick = (groupName: string) => {
    setActiveMuscleGroup(groupName);
    scrollTabIntoView(groupName);
    const sectionEl = sectionRefs.current.get(groupName);
    if (sectionEl && listRef.current) {
      isScrollingToRef.current = true;
      sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => { isScrollingToRef.current = false; }, 500);
    }
  };

  // Update active tab on scroll
  const handleScroll = useCallback(() => {
    if (isScrollingToRef.current || !listRef.current) return;

    const listTop = listRef.current.getBoundingClientRect().top;
    let closest: string | null = null;
    let closestDist = Infinity;

    for (const [name, el] of sectionRefs.current.entries()) {
      const dist = Math.abs(el.getBoundingClientRect().top - listTop);
      if (dist < closestDist) {
        closestDist = dist;
        closest = name;
      }
    }

    if (closest) {
      setActiveMuscleGroup(closest);
      scrollTabIntoView(closest);
    }
  }, [scrollTabIntoView]);

  // Store section ref callback
  const setSectionRef = useCallback((groupName: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(groupName, el);
    } else {
      sectionRefs.current.delete(groupName);
    }
  }, []);

  const handleCreateExercise = async () => {
    if (!newExerciseName.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/modules/west/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newExerciseName.trim(),
          description: null,
        }),
      });

      if (response.status === 409) {
        setError("An exercise with this name already exists");
        return;
      }

      if (!response.ok) throw new Error("Failed to create exercise");

      const created = await response.json();
      const summary: ExerciseSummary = {
        id: created.id,
        name: created.name,
        primary_muscles: [],
        secondary_muscles: [],
        estimated_one_rep_max: null,
      };
      onExerciseCreated(summary);
      onSelect(summary);
      onClose();
    } catch (error) {
      console.error("Error creating exercise:", error);
      setError("Failed to create exercise");
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <SubModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Exercise"
      disableClose={isSaving}
    >
      <div className="flex flex-col h-[80vh]">

        {/* SEARCH INPUT */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            className="input-field !pl-9"
          />
        </div>

        {/* MUSCLE GROUP TABS */}
        {!isSearching && muscleGroupNames.length > 1 && (
          <div ref={tabBarRef} className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {muscleGroupNames.map((name) => (
              <button
                key={name}
                ref={(el) => { if (el) tabRefs.current.set(name, el); else tabRefs.current.delete(name); }}
                onClick={() => handleTabClick(name)}
                className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${activeMuscleGroup === name
                  ? "bg-primary text-white"
                  : "bg-card text-secondary hover:text-primary"
                  }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* EXERCISE LIST */}
        <div
          ref={listRef}
          className="flex flex-col flex-1 overflow-y-auto min-h-0"
          onScroll={handleScroll}
        >
          {filteredExercises.length === 0 ? (
            <p className="text-secondary py-4 text-center">No exercises found</p>
          ) : isSearching ? (
            // Flat list when searching
            filteredExercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => { onSelect(ex); onClose(); }}
                className="text-left px-3 py-2.5 rounded-lg hover:bg-card transition-colors"
              >
                <span className="text-primary">{ex.name}</span>
              </button>
            ))
          ) : (
            // Grouped list
            groupedExercises.map(([groupName, groupExercises]) => (
              <div
                key={groupName}
                ref={(el) => setSectionRef(groupName, el)}
              >
                <div className="text-secondary text-xs font-medium uppercase tracking-wide px-3 pt-3 pb-1 sticky top-0 bg-[var(--card-bg)]">
                  {groupName}
                </div>
                {groupExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => { onSelect(ex); onClose(); }}
                    className="text-left px-3 py-2.5 rounded-lg hover:bg-card transition-colors w-full"
                  >
                    <span className="text-primary">{ex.name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* ADD EXERCISE SECTION */}
        {isAdding ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            <input
              type="text"
              value={newExerciseName}
              onChange={(e) => setNewExerciseName(e.target.value)}
              placeholder="Exercise name..."
              className="input-field"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateExercise(); }}
            />
            {error && <p className="text-sm text-alert-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => { setIsAdding(false); setNewExerciseName(""); setError(null); }}
                className="btn-link"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateExercise}
                disabled={isSaving || !newExerciseName.trim()}
                className="btn-primary"
              >
                {isSaving ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center border-t pt-3">
            <Button onClick={() => setIsAdding(true)} className="btn-link">
              <Plus className="w-4 h-4" />
              <span>New Exercise</span>
            </Button>
          </div>
        )}
      </div>
    </SubModal>
  );
}
