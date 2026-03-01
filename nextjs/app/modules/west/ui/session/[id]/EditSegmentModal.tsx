"use client"

import { useState, useEffect, useRef } from "react";
import { Plus, StickyNote, X, Circle, CircleCheck, EllipsisVertical } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import SubModal from "@/components/SubModal";
import { SegmentWithSets } from "../../../types/segment";
import { Exercise } from "../../../types/exercise";

enum SetField {
  Weight = "weight",
  Reps = "reps",
  Rpe = "rpe",
  Notes = "notes",
}

interface EditSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (segment: SegmentWithSets) => void;
  onRemove: () => void;
  segment: SegmentWithSets | null;
  exercises: Exercise[];
  isSaving: boolean;
}

export default function EditSegmentModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  segment,
  exercises,
  isSaving,
}: EditSegmentModalProps) {

  // INPUT
  const [editedSegment, setEditedSegment] = useState<SegmentWithSets | null>(null);
  const [editedSetNotes, setEditedSetNotes] = useState("");

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);
  const [openMenuSetId, setOpenMenuSetId] = useState<string | null>(null);
  const [menuDirection, setMenuDirection] = useState<"down" | "up">("down");
  const menuRef = useRef<HTMLDivElement>(null);

  // DERIVED
  const warmupSets = editedSegment?.sets.filter((s) => s.is_warmup) ?? [];
  const workingSets = editedSegment?.sets.filter((s) => !s.is_warmup) ?? [];
  const targetWarmupCount = editedSegment?.target
    ? editedSegment.target.sets.filter((s) => s.is_warmup).length
    : 0;

  const targetWorkingCount = editedSegment?.target
    ? editedSegment.target.sets.filter((s) => !s.is_warmup).length
    : 0;

  const isTargetExerciseSwapped = editedSegment?.target &&
    editedSegment.target.exercise_id !== editedSegment.exercise_id;

  // Sync local state when modal opens, add additional set rows
  useEffect(() => {
    if (isOpen && segment) {

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
            id: crypto.randomUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: true,
            reps: 0,
            weight: 0,
            rpe: null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }

        // Add additional working sets to reach target count, if necessary
        for (let i = loggedWorkingCount + 1; i <= targetWorkingCount; i++) {
          clonedSegment.sets.push({
            id: crypto.randomUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: false,
            reps: 0,
            weight: 0,
            rpe: null,
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

  // Close action menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuSetId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editedSegment) return null;

  const handleExerciseChange = (exerciseId: string) => {
    const selectedExercise = exercises.find((e) => e.id === exerciseId);
    if (!selectedExercise) return;
    setEditedSegment({
      ...editedSegment,
      exercise_id: exerciseId,
      exercise_name: selectedExercise.name,
    });
  };

  const handleNotesChange = (notes: string) => {
    setEditedSegment({
      ...editedSegment,
      notes: notes || null,
    });
  };

  const handleSetFieldChange = (setId: string, field: SetField, value: string) => {
    const updatedSets = editedSegment.sets.map((set) => {
      if (set.id !== setId) return set;
      const updatedSet = { ...set };
      if (field === SetField.Weight) {
        updatedSet.weight = parseFloat(value) || 0;
      } else if (field === SetField.Reps) {
        updatedSet.reps = parseInt(value) || 0;
      } else if (field === SetField.Rpe) {
        updatedSet.rpe = value === "" ? null : parseFloat(value) || null;
      } else if (field === SetField.Notes) {
        updatedSet.notes = value || null;
      }
      return updatedSet;
    });
    setEditedSegment({ ...editedSegment, sets: updatedSets });
  };

  const handleAddSet = (isWarmup: boolean) => {
    const setsOfType = editedSegment.sets.filter((s) => s.is_warmup === isWarmup);

    const newSet = {
      id: crypto.randomUUID(),
      session_segment_id: editedSegment.id,
      set_number: setsOfType.length + 1,
      is_warmup: isWarmup,
      reps: 0,
      weight: 0,
      rpe: null,
      notes: null,
      is_completed: false,
      created_at: new Date(),
      modified_at: new Date(),
    };
    setEditedSegment({
      ...editedSegment,
      sets: [...editedSegment.sets, newSet],
    });
  };

  const handleClearSet = (setId: string, isBeyondTarget: boolean) => {

    // If given set index is greater than target set count, remove set
    if (isBeyondTarget) {
      const updatedSets = editedSegment.sets.filter((s) => s.id !== setId);
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // If given set index is equal to target set count, clear set
    else {
      const updatedSets = editedSegment.sets.map((s) => {
        if (s.id !== setId) return s;
        return { ...s, weight: 0, reps: 0, rpe: null, notes: null, is_completed: false };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // UI hides clear button for any other scenarios
  };

  const handleToggleSetCompleted = (setId: string) => {
    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    // Find target set at the same set index so values can be copied into fields not entered by user
    const targetSetData = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );

    const hasLoggedSetData = set.weight > 0 || set.reps > 0 || set.rpe !== null || set.notes !== null;

    // If handling toggling from OFF to ON
    if (!set.is_completed) {

      // No target or logged data, can't toggle as complete
      if (!hasLoggedSetData && !targetSetData) {
        console.error(`handleToggleSetCompleted() called but set has no target or logged data!`);
        return;
      }

      // Iterate through all sets and edit the one to be marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not the desired set, exit

        // Autofill empty fields from target when available
        if (targetSetData) {
          return {
            ...set,
            weight: set.weight > 0 ? set.weight : targetSetData.weight,
            reps: set.reps > 0 ? set.reps : targetSetData.reps,
            rpe: set.rpe !== null ? set.rpe : targetSetData.rpe,
            is_completed: true,
          };
        }

        // No target available, just mark completed
        return { ...set, is_completed: true };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // If handling toggling from ON to OFF
    else {

      // Iterate through all sets and edit the one to be un-marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not desired set, exit
        return { ...set, is_completed: false };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }
  };

  // SET NOTES HANDLERS
  const handleOpenSetNotes = (setId: string) => {
    const set = editedSegment.sets.find((s) => s.id === setId);
    setEditedSetNotes(set?.notes || "");
    setNotesSetId(setId);
  };

  const handleSaveSetNotes = () => {
    if (notesSetId === null) return;
    handleSetFieldChange(notesSetId, SetField.Notes, editedSetNotes.trim());
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  const handleCancelSetNotes = () => {
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  // Dismiss mobile keyboard on Enter
  const handleEnterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const handleSave = () => {
    if (!editedSegment.exercise_id) {
      toast.error("Please select an exercise");
      return;
    }
    const trimmedNotes = editedSegment.notes?.trim() || null;
    onSave({ ...editedSegment, notes: trimmedNotes });
  };

  // Create and build JSX for a set row
  const renderSetRow = (set: typeof editedSegment.sets[0], isLastInSection: boolean) => {
    const targetSet = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    const segmentTargetSetCount = set.is_warmup ? targetWarmupCount : targetWorkingCount;
    const hasSetData = set.weight > 0 || set.reps > 0 || set.rpe !== null || set.notes !== null;
    const isBeyondTarget = set.set_number > segmentTargetSetCount; // Determines if current set index is greater than target set count
    const showRemoveSet = isLastInSection && isBeyondTarget;
    const canComplete = set.reps > 0 || (targetSet && targetSet.reps > 0); // Can complete if there are reps or target reps to autofill from
    const hasNotes = !!set.notes;

    return (
      <div key={set.id} className="relative flex items-center gap-2">

        {/* SET NOTES DOT */}
        {hasNotes && <div className="dot-blue absolute top-1 right-0" />}

        {/* SET INDICATOR BAR */}
        <div className={isBeyondTarget ? "bar-grey" : "bar-green"} />

        {/* COMPLETION TOGGLE */}
        <Button
          onClick={() => handleToggleSetCompleted(set.id)}
          className={`btn-link mt-5 ${!canComplete ? 'invisible' : ''}`}
          title={set.is_completed ? "Mark incomplete" : "Mark complete"}
        >
          {set.is_completed
            ? <CircleCheck className="icon-success !w-4 !h-4" />
            : <Circle className="icon-muted !w-4 !h-4" />
          }
        </Button>

        {/* WEIGHT INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${targetSet?.set_number !== 1 && 'hidden'}`}>Weight</label>
          <input
            type="number"
            value={set.weight || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Weight, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet ? String(targetSet.weight) : "-"}
            onFocus={(e) => e.target.select()}
            onKeyDown={handleEnterBlur}
            step="0.5" // TODO add steps to schema for exercises
            min="0"
          />
        </div>

        {/* REPS INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${targetSet?.set_number !== 1 && 'hidden'}`}>Reps</label>
          <input
            type="number"
            value={set.reps || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Reps, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet ? String(targetSet.reps) : "-"}
            onFocus={(e) => e.target.select()}
            onKeyDown={handleEnterBlur}
            min="0"
          />
        </div>

        {/* RPE INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${targetSet?.set_number !== 1 && 'hidden'}`}>RPE</label>
          <input
            type="number"
            value={set.rpe ?? ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Rpe, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet?.rpe != null ? String(targetSet.rpe) : "-"}
            onFocus={(e) => e.target.select()}
            onKeyDown={handleEnterBlur}
            step="0.5"
            min="5"
            max="10"
          />
        </div>

        {/* ACTION MENU */}
        <div className="relative mt-5" ref={openMenuSetId === set.id ? menuRef : undefined}>

          {/* MENU TRIGGER */}
          <Button
            onClick={(e) => {
              if (openMenuSetId === set.id) { setOpenMenuSetId(null); return; }
              const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const scrollContainer = (e.currentTarget as HTMLElement).closest(".modal-body");
              const containerBottom = scrollContainer
                ? scrollContainer.getBoundingClientRect().bottom
                : window.innerHeight;
              const spaceBelow = containerBottom - buttonRect.bottom;
              setMenuDirection(spaceBelow < 120 ? "up" : "down"); // 120px accounts for menu height

              // Preserve scroll position so popover render doesn't shift view
              const scrollTop = scrollContainer?.scrollTop;
              setOpenMenuSetId(set.id);
              if (scrollContainer && scrollTop !== undefined) {
                requestAnimationFrame(() => { scrollContainer.scrollTop = scrollTop; });
              }
            }}
            className="btn-link"
          >
            <EllipsisVertical className="w-4 h-4" />
          </Button>

          {/* MENU POPOVER */}
          {openMenuSetId === set.id && (
            <div className={`popover-menu ${menuDirection === "up" ? "popover-menu-up" : ""}`}>

              {/* NOTES ITEM */}
              <button
                onClick={() => { handleOpenSetNotes(set.id); setOpenMenuSetId(null); }}
                className="popover-item"
              >
                <StickyNote className="w-4 h-4 mr-3" />
                {set.notes ? "Edit Notes" : "Add Notes"}
                {hasNotes && <div className="dot-blue ml-auto" />}
              </button>

              {/* REMOVE SET ITEM */}
              {showRemoveSet && (
                <button
                  onClick={() => { handleClearSet(set.id, true); setOpenMenuSetId(null); }}
                  className="popover-item"
                >
                  <X className="w-4 h-4 mr-3" />
                  Remove Set
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editedSegment.exercise_name || "New Exercise"}
      disableClose={isSaving}
      footer={
        <>

          {/* REMOVE BUTTON */}
          <Button
            onClick={onRemove}
            disabled={isSaving}
            className="btn-delete mr-auto"
          >
            Remove
          </Button>

          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isSaving}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-success"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >

      {/* EXERCISE DROPDOWN */}
      <div>
        <label className="text-secondary">Exercise</label>
        <select
          value={editedSegment.exercise_id}
          onChange={(e) => handleExerciseChange(e.target.value)}
          className="input-field"
        >
          <option value="" disabled>Select an exercise...</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>

        {/* ORIGINAL TARGET HINT */}
        {isTargetExerciseSwapped && (
          <p className="text-secondary">Swapped from {editedSegment.target!.exercise_name}</p>
        )}
      </div>

      {/* SETS */}
      <div>
        <label className="text-h2">Sets</label>

        <div className="space-y-4">

          {/* WARMUP SETS SECTION */}
          <div className="space-y-4 flex flex-col">

            {/* SECTION LABEL */}
            <label className="text-h3">Warmup</label>

            {/* WARMUP SET ROWS */}
            {warmupSets.map((set, index) => renderSetRow(set, index === warmupSets.length - 1))}

            {/* ADD WARMUP SET BUTTON */}
            <div className="flex justify-center">
              <Button
                onClick={() => handleAddSet(true)}
                className="btn-link"
              >
                <Plus className="w-4 h-4" />
                <span>Add Warmup Set</span>
              </Button>
            </div>
          </div>

          {/* SECTION DIVIDER */}
          <div className="border-t" />

          {/* WORKING SETS SECTION */}
          <div className="space-y-4 flex flex-col">

            {/* SECTION LABEL */}
            <label className="text-h3">Working</label>

            {/* WORKING SET ROWS */}
            {workingSets.map((set, index) => renderSetRow(set, index === workingSets.length - 1))}

            {/* ADD WORKING SET BUTTON */}
            <div className="flex justify-center">
              <Button
                onClick={() => handleAddSet(false)}
                className="btn-link w-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add Working Set</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* NOTES INPUT */}
      <div>
        <label className="text-h2">Exercise Notes</label>
        <textarea
          placeholder="Exercise notes..."
          value={editedSegment.notes || ""}
          onChange={(e) => {
            handleNotesChange(e.target.value);
            const textarea = e.target;
            textarea.style.height = "auto";
            const maxHeight = parseFloat(getComputedStyle(textarea).lineHeight) * 5 + 16;
            const newHeight = textarea.scrollHeight;
            textarea.style.height = Math.min(newHeight, maxHeight) + "px";
            textarea.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
          }}
          className="input-field resize-none overflow-hidden"
          rows={1}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
              el.style.overflowY = "hidden";
            }
          }}
        />
      </div>

      {/* SET NOTES SUB-MODAL */}
      <SubModal
        isOpen={notesSetId !== null}
        onClose={handleCancelSetNotes}
        title="Set Notes"
        footer={
          <>

            {/* CANCEL BUTTON */}
            <Button
              onClick={handleCancelSetNotes}
              className="btn-link"
            >
              Cancel
            </Button>

            {/* SAVE BUTTON */}
            <Button
              onClick={handleSaveSetNotes}
              className="btn-success"
            >
              Save
            </Button>
          </>
        }
      >

        {/* NOTES TEXTAREA */}
        <textarea
          value={editedSetNotes}
          onChange={(e) => setEditedSetNotes(e.target.value)}
          className="input-field"
          rows={4}
          placeholder="Add notes for this set..."
          autoFocus
        />
      </SubModal>
    </Modal>
  );
}
