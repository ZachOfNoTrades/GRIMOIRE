"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { SuggestedExercise } from "../../../types/segment";

interface ExerciseSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (exercises: SuggestedExercise[]) => void;
  suggestions: SuggestedExercise[];
  isAccepting: boolean;
}

export default function ExerciseSuggestionsModal({
  isOpen,
  onClose,
  onAccept,
  suggestions,
  isAccepting,
}: ExerciseSuggestionsModalProps) {

  // STATE
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(suggestions.map((_, i) => i))
  );

  const toggleExercise = (index: number) => {
    setSelectedIndices((prev) => {
      const updated = new Set(prev);
      if (updated.has(index)) {
        updated.delete(index);
      } else {
        updated.add(index);
      }
      return updated;
    });
  };

  const handleAccept = () => {
    const accepted = suggestions.filter((_, i) => selectedIndices.has(i));
    if (accepted.length > 0) {
      onAccept(accepted);
    }
  };

  const selectedCount = selectedIndices.size;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Suggested Exercises"
      disableClose={isAccepting}
      footer={
        <>
          {/* SKIP BUTTON */}
          <Button
            onClick={onClose}
            disabled={isAccepting}
            className="btn-link"
          >
            Skip
          </Button>

          {/* ACCEPT BUTTON */}
          <Button
            onClick={handleAccept}
            disabled={isAccepting || selectedCount === 0}
            className="btn-blue"
          >
            {isAccepting ? "Creating..." : `Add ${selectedCount} Exercise${selectedCount !== 1 ? "s" : ""}`}
          </Button>
        </>
      }
    >

      {/* DESCRIPTION */}
      <p className="text-secondary text-sm mb-4">
        The AI suggests creating these exercises to complete the session. Select the ones you want to add to your library.
      </p>

      {/* EXERCISE LIST */}
      <div className="flex flex-col gap-3">
        {suggestions.map((exercise, index) => {
          const isSelected = selectedIndices.has(index);
          return (

            // EXERCISE CARD
            <div
              key={index}
              className={`card cursor-pointer transition-opacity ${!isSelected ? "opacity-40" : ""}`}
              onClick={() => !isAccepting && toggleExercise(index)}
            >

              {/* CARD CONTENT */}
              <div className="card-content">

                {/* HEADER ROW */}
                <div className="flex items-center justify-between gap-2">

                  {/* NAME AND CATEGORY */}
                  <div className="flex-1 min-w-0">
                    <p className="text-primary font-medium">{exercise.name}</p>
                    <p className="text-secondary text-sm">
                      {exercise.category}
                      {exercise.is_timed && " (Timed)"}
                      {exercise.is_warmup && " — Warmup"}
                      {" — "}
                      {exercise.sets.length} set{exercise.sets.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* TOGGLE ICON */}
                  <div className="flex-shrink-0">
                    {isSelected ? (
                      <Check className="w-5 h-5" style={{ color: "var(--btn-green-bg)" }} />
                    ) : (
                      <X className="w-5 h-5" style={{ color: "var(--color-gray)" }} />
                    )}
                  </div>
                </div>

                {/* DESCRIPTION */}
                {exercise.description && (
                  <p className="text-secondary text-sm mt-1">{exercise.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
