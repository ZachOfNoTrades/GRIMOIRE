"use client"

import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { ExerciseSummary } from "../../../types/exercise";
import ExerciseListItem from "./ExerciseListItem";

interface BrowseViewProps {
  exercises: ExerciseSummary[];
  showDisabled: boolean;
  onShowDisabledChange: (value: boolean) => void;
  onSelect: (exercise: ExerciseSummary) => void;
  onInfo: (exercise: ExerciseSummary) => void;
  onNavigateMuscleGroup: (groupName: string) => void;
}

export default function BrowseView({
  exercises,
  showDisabled,
  onShowDisabledChange,
  onSelect,
  onInfo,
  onNavigateMuscleGroup,
}: BrowseViewProps) {

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");

  // STATE
  const [sortMode, setSortMode] = useState<"alphabetical" | "muscles">("alphabetical");

  // DERIVED
  const isSearching = searchQuery.length > 0;

  const normalizedQuery = searchQuery.toLowerCase().replace(/-/g, "");
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const filteredExercises = exercises.filter((ex) => {
    if (!showDisabled && ex.is_disabled) return false;
    const normalizedName = ex.name.toLowerCase().replace(/-/g, "");
    return queryWords.every((word) => normalizedName.includes(word));
  });

  // Group exercises by first letter for alphabetical view
  const alphabeticalGroups = (() => {
    const groups = new Map<string, ExerciseSummary[]>();

    for (const ex of filteredExercises) {
      const firstChar = ex.name.charAt(0).toUpperCase();
      const letter = /[0-9]/.test(firstChar) ? "#" : firstChar;
      if (!groups.has(letter)) {
        groups.set(letter, []);
      }
      groups.get(letter)!.push(ex);
    }

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  })();

  // Collect unique primary and secondary muscle group names
  const primaryMuscleGroups = (() => {
    const names = new Set<string>();
    for (const ex of filteredExercises) {
      for (const m of ex.primary_muscles) names.add(m);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  })();

  const secondaryMuscleGroups = (() => {
    const names = new Set<string>();
    for (const ex of filteredExercises) {
      for (const m of ex.secondary_muscles) names.add(m);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  })();

  return (
    <div className="flex flex-col gap-2 h-full">

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

      {/* SORT TABS */}
      {!isSearching && (
        <nav className="flex sm:space-x-1 px-2 border-b border-card" role="tablist">

          {/* ALPHABETICAL TAB */}
          <button
            onClick={() => setSortMode("alphabetical")}
            className={`tab-button max-sm:flex-1 max-sm:justify-center ${sortMode === "alphabetical" ? "tab-button-active" : ""}`}
            role="tab"
            aria-selected={sortMode === "alphabetical"}
          >
            <span>All Exercises</span>
          </button>

          {/* MUSCLES TAB */}
          <button
            onClick={() => setSortMode("muscles")}
            className={`tab-button max-sm:flex-1 max-sm:justify-center ${sortMode === "muscles" ? "tab-button-active" : ""}`}
            role="tab"
            aria-selected={sortMode === "muscles"}
          >
            <span>Muscles</span>
          </button>

          {/* SHOW DISABLED TOGGLE */}
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer text-secondary">
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => onShowDisabledChange(e.target.checked)}
            />
            <span>Show disabled</span>
          </label>
        </nav>
      )}

      {/* EXERCISE LIST */}
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 scrollbar-hide pr-2">
        {filteredExercises.length === 0 ? (
          <p className="text-secondary py-4 text-center">No exercises found</p>
        ) : isSearching ? (
          // Flat list when searching
          filteredExercises.map((ex) => (
            <ExerciseListItem key={ex.id} exercise={ex} onSelect={onSelect} onInfo={onInfo} />
          ))
        ) : sortMode === "alphabetical" ? (
          // Grouped by letter
          alphabeticalGroups.map(([letter, letterExercises]) => (
            <div key={letter} className="flex flex-col gap-1">
              <div className="text-h1 mt-4 sticky top-0 bg-[var(--card-bg)]">
                {letter}
              </div>
              {letterExercises.map((ex) => (
                <ExerciseListItem key={ex.id} exercise={ex} onSelect={onSelect} onInfo={onInfo} />
              ))}
            </div>
          ))
        ) : (
          // Muscle group list with primary/secondary sections
          <>
            {/* PRIMARY MUSCLE GROUPS */}
            {primaryMuscleGroups.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-h1 mt-4 sticky top-0 bg-[var(--card-bg)]">
                  Primary
                </div>
                {primaryMuscleGroups.map((groupName) => (
                  <div key={groupName} className="list-item" onClick={() => onNavigateMuscleGroup(groupName)}>

                    {/* MUSCLE GROUP NAME */}
                    <span className="text-primary flex-1">{groupName}</span>

                    {/* ARROW */}
                    <span className="p-2 -mr-2 shrink-0">
                      <ChevronRight className="w-4.5 h-4.5 text-muted" />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* SECONDARY MUSCLE GROUPS */}
            {secondaryMuscleGroups.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-h1 mt-4 sticky top-0 bg-[var(--card-bg)]">
                  Secondary
                </div>
                {secondaryMuscleGroups.map((groupName) => (
                  <div key={groupName} className="list-item" onClick={() => onNavigateMuscleGroup(groupName)}>

                    {/* MUSCLE GROUP NAME */}
                    <span className="text-primary flex-1">{groupName}</span>

                    {/* ARROW */}
                    <span className="p-2 -mr-2 shrink-0">
                      <ChevronRight className="w-4.5 h-4.5 text-muted" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
