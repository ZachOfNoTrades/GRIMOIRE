"use client"

import { useState, useEffect, useRef } from "react";
import { Plus, StickyNote, X, Circle, CircleCheck, EllipsisVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { SegmentWithSets } from "../../../types/segment";
import { generateUUID } from "../../../utils/id";

enum SetField {
  Weight = "weight",
  Reps = "reps",
  Rpe = "rpe",
  Notes = "notes",
}

interface SetTabProps {
  editedSegment: SegmentWithSets;
  setEditedSegment: (segment: SegmentWithSets) => void;
  isWarmupSegment: boolean;
  onAutoSave: (segment: SegmentWithSets) => void;
}

export default function SetTab({
  editedSegment,
  setEditedSegment,
  isWarmupSegment,
  onAutoSave,
}: SetTabProps) {

  // INPUT
  const [editedSetNotes, setEditedSetNotes] = useState("");

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);
  const [openMenuSetId, setOpenMenuSetId] = useState<string | null>(null);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const [menuDirection, setMenuDirection] = useState<"down" | "up">("down");
  const menuRef = useRef<HTMLDivElement>(null);

  // DERIVED
  const warmupSets = editedSegment.sets.filter((s) => s.is_warmup);
  const workingSets = editedSegment.sets.filter((s) => !s.is_warmup);

  // Prescribed target counts are captured on mount and stay fixed so added sets remain "beyond target"
  const [prescribedWarmupCount] = useState(() =>
    editedSegment.target ? editedSegment.target.sets.filter((s) => s.is_warmup).length : 0
  );
  const [prescribedWorkingCount] = useState(() =>
    editedSegment.target ? editedSegment.target.sets.filter((s) => !s.is_warmup).length : 0
  );

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

  const handleSetFieldBlur = (setId: string) => {
    const set = editedSegment.sets.find(s => s.id === setId);
    if (set?.is_completed) {
      onAutoSave(editedSegment);
    }
  };

  const handleAddSet = (isWarmup: boolean) => {
    const setsOfType = editedSegment.sets.filter((s) => s.is_warmup === isWarmup);
    const newSetNumber = setsOfType.length + 1;

    const newSet = {
      id: generateUUID(),
      session_segment_id: editedSegment.id,
      set_number: newSetNumber,
      is_warmup: isWarmup,
      reps: 0,
      weight: 0,
      rpe: null,
      notes: null,
      is_completed: false,
      created_at: new Date(),
      modified_at: new Date(),
    };

    // Clone the last target set as a placeholder for the new set
    const targetSetsOfType = editedSegment.target?.sets.filter((s) => s.is_warmup === isWarmup) ?? [];
    const lastTargetSet = targetSetsOfType.length > 0 ? targetSetsOfType[targetSetsOfType.length - 1] : null;
    const updatedTarget = editedSegment.target && lastTargetSet
      ? {
          ...editedSegment.target,
          sets: [...editedSegment.target.sets, { ...lastTargetSet, set_number: newSetNumber }],
        }
      : editedSegment.target;

    setEditedSegment({
      ...editedSegment,
      target: updatedTarget,
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
      const updatedSegment = { ...editedSegment, sets: updatedSets };
      setEditedSegment(updatedSegment);
      onAutoSave(updatedSegment);
    }

    // If handling toggling from ON to OFF
    else {

      // Iterate through all sets and edit the one to be un-marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not desired set, exit
        return { ...set, is_completed: false };
      });
      const updatedSegment = { ...editedSegment, sets: updatedSets };
      setEditedSegment(updatedSegment);
      onAutoSave(updatedSegment);
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

  // Advance focus on Enter: weight → reps → rpe → mark complete & close keyboard
  // If the next field already has data, close keyboard instead of advancing
  const handleEnterAdvance = (e: React.KeyboardEvent<HTMLInputElement>, setId: string, field: SetField) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    if (field === SetField.Weight) {
      if (set.reps > 0) {
        (e.target as HTMLInputElement).blur();
      } else {
        document.getElementById(`${setId}-reps`)?.focus();
      }
    } else if (field === SetField.Reps) {
      if (set.rpe !== null) {
        (e.target as HTMLInputElement).blur();
      } else {
        document.getElementById(`${setId}-rpe`)?.focus();
      }
    } else if (field === SetField.Rpe) {
      (e.target as HTMLInputElement).blur();
      if (!set.is_completed) {
        const targetSet = editedSegment.target?.sets.find(
          (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
        );
        const hasData = set.weight > 0 || set.reps > 0 || set.rpe !== null;
        if (hasData || targetSet) handleToggleSetCompleted(setId);
      }
    }
  };

  // Create and build JSX for a set row
  const renderSetRow = (set: typeof editedSegment.sets[0], isFirstInSection: boolean, isLastInSection: boolean) => {
    const targetSet = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    const segmentTargetSetCount = set.is_warmup ? prescribedWarmupCount : prescribedWorkingCount;
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
        <div className={`${isFirstInSection ? 'mt-5' : ''} ${isBeyondTarget ? "bar-grey" : "bar-green"}`} />

        {/* COMPLETION TOGGLE */}
        <Button
          onClick={() => handleToggleSetCompleted(set.id)}
          className={`btn-link ${isFirstInSection ? 'mt-5' : ''} ${!canComplete ? 'invisible' : ''}`}
          title={set.is_completed ? "Mark incomplete" : "Mark complete"}
        >
          {set.is_completed
            ? <CircleCheck className="icon-green !w-4 !h-4" />
            : <Circle className="icon-gray !w-4 !h-4" />
          }
        </Button>

        {/* WEIGHT INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Weight</label>
          <input
            id={`${set.id}-weight`}
            type="number"
            value={set.weight || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Weight, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet ? String(targetSet.weight) : "-"}
            onFocus={(e) => e.target.select()}
            onBlur={() => handleSetFieldBlur(set.id)}
            onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Weight)}
            step="0.5"
            min="0"
          />
        </div>

        {/* REPS INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Reps</label>
          <input
            id={`${set.id}-reps`}
            type="number"
            value={set.reps || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Reps, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet ? String(targetSet.reps) : "-"}
            onFocus={(e) => e.target.select()}
            onBlur={() => handleSetFieldBlur(set.id)}
            onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Reps)}
            min="0"
          />
        </div>

        {/* RPE INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>RPE</label>
          <input
            id={`${set.id}-rpe`}
            type="number"
            value={set.rpe ?? ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Rpe, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet?.rpe != null ? String(targetSet.rpe) : "-"}
            onFocus={(e) => e.target.select()}
            onBlur={() => handleSetFieldBlur(set.id)}
            onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Rpe)}
            step="0.5"
            min="5"
            max="10"
          />
        </div>

        {/* ACTION MENU */}
        <div className={`relative ${isFirstInSection ? 'mt-5' : ''}`} ref={openMenuSetId === set.id ? menuRef : undefined}>

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
    <>

      {/* SETS */}
      <div>
        <div className="space-y-4">

          {/* WARMUP SETS SECTION */}
          {isWarmupSegment ? (

            // Warmup-only segment: show warmup sets directly
            <div className="space-y-4 flex flex-col">
              {warmupSets.map((set, index) => renderSetRow(set, index === 0, index === warmupSets.length - 1))}
              <div className="flex justify-center">
                <Button onClick={() => handleAddSet(true)} className="btn-link">
                  <Plus className="w-4 h-4" />
                  <span>Add Warmup Set</span>
                </Button>
              </div>
            </div>
          ) : (

            // Regular segment: warmup sets in expandable dropdown
            <div className={`expandable-card ${isWarmupExpanded ? "expandable-card-open" : "py-1"}`}>
              <div
                className="expandable-card-toggle"
                onClick={() => setIsWarmupExpanded(!isWarmupExpanded)}
              >
                <h3 className="text-h3">Warmup</h3>
                {isWarmupExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted" />
                )}
              </div>
              {isWarmupExpanded && (
                <div className="expandable-card-content space-y-4 flex flex-col">
                  {warmupSets.map((set, index) => renderSetRow(set, index === 0, index === warmupSets.length - 1))}
                  <div className="flex justify-center">
                    <Button onClick={() => handleAddSet(true)} className="btn-link">
                      <Plus className="w-4 h-4" />
                      <span>Add Warmup Set</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WORKING SETS SECTION (hidden for warmup segments) */}
          {!isWarmupSegment && (
            <>

              {/* WORKING SETS */}
              <div className="space-y-4 flex flex-col">

                {/* WORKING SET ROWS */}
                {workingSets.map((set, index) => renderSetRow(set, index === 0, index === workingSets.length - 1))}

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
            </>
          )}
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
          onBlur={(e) => {
            const trimmedNotes = e.target.value.trim() || null;
            const updatedSegment = { ...editedSegment, notes: trimmedNotes };
            setEditedSegment(updatedSegment);
            onAutoSave(updatedSegment);
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
      <Modal
        isOpen={notesSetId !== null}
        onClose={handleCancelSetNotes}
        title="Set Notes"
        zIndex={60}
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
              className="btn-green"
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
      </Modal>

    </>
  );
}
