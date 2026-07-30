'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, Pencil, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import DaySlotModal from './DaySlotModal';
import type { DaySlotInput } from '../types/dayArchetype';

// Build a COMPLETE archetype (name + description + slots) in one flow and create it atomically via a
// single POST /day-archetypes { name, description, program_id, slots }. Slots are collected in memory
// (DaySlotModal in-memory mode) so there's no half-built archetype if the user cancels. Shared by the
// program-generation wizard and the day-archetype editor — replacing the old create-then-add-slots path.
export default function ArchetypeBuilder({
  isOpen, onClose, onCreated, programId = null, muscleGroups, exercises,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  programId?: string | null;
  muscleGroups: { id: string; name: string }[];
  exercises: { id: string; name: string }[];
}) {
  // INPUT
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slots, setSlots] = useState<DaySlotInput[]>([]);

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // null = adding a new slot

  const muscleName = useMemo(() => new Map(muscleGroups.map((m) => [m.id, m.name])), [muscleGroups]);

  // Open the slot editor to add (null) or edit an existing in-memory slot.
  const openSlot = (index: number | null) => {
    setEditingIndex(index);
    setSlotModalOpen(true);
  };

  // Receive an assembled slot from DaySlotModal (in-memory mode) — append or replace.
  const acceptSlot = (input: DaySlotInput) => {
    setSlots((prev) => {
      if (editingIndex === null) return [...prev, input];
      return prev.map((s, i) => (i === editingIndex ? input : s));
    });
  };

  const removeSlot = (index: number) => setSlots((prev) => prev.filter((_, i) => i !== index));

  // Swap a slot with its neighbour to control engine read order.
  const moveSlot = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    setSlots((prev) => {
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Create the archetype + slots in one request.
  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/modules/golem/api/day-archetypes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null, program_id: programId, slots }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create archetype');
        return;
      }
      toast.success('Archetype created');
      onCreated(data.id);
      // Reset for next time.
      setName('');
      setDescription('');
      setSlots([]);
      onClose();
    } catch {
      toast.error('Failed to create archetype');
    } finally {
      setIsSaving(false);
    }
  };

  // Short, human-readable summary of a slot for the list row.
  const slotSummary = (slot: DaySlotInput): string => {
    const parts: string[] = [slot.role];
    if (slot.target_muscle_group_id) parts.push(muscleName.get(slot.target_muscle_group_id) ?? 'muscle');
    if (slot.progression_model === 'time_effort') {
      if (slot.time_low_seconds != null) parts.push(`${slot.time_low_seconds}-${slot.time_high_seconds ?? slot.time_low_seconds}s`);
    } else {
      parts.push(`${slot.rep_low}-${slot.rep_high} reps`);
    }
    parts.push(`×${slot.set_target}`);
    if (slot.target_rpe != null) parts.push(`@RPE ${slot.target_rpe}`);
    return parts.join(' · ');
  };

  return (
    /* ARCHETYPE BUILDER MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Archetype"
      disableClose={isSaving}
      fullHeight
      footer={
        <>
          {/* CANCEL */}
          <Button onClick={onClose} disabled={isSaving} className="btn-link mr-auto">Cancel</Button>

          {/* CREATE */}
          <Button onClick={handleSave} disabled={isSaving} className="btn-blue">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isSaving ? 'Creating…' : 'Create archetype'}</span>
          </Button>
        </>
      }
    >
      {/* FORM */}
      <div className="flex flex-col gap-4">

        {/* NAME */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Name</label>
          <input
            className="input-field"
            type="text"
            placeholder="e.g. Leg Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="words"
          />
        </div>

        {/* DESCRIPTION */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Description</label>
          <textarea
            className="input-field min-h-[64px] resize-y"
            rows={2}
            placeholder="Optional notes about this day…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* SLOTS HEADER */}
        <div className="flex items-center justify-between">
          <label className="text-secondary">Slots ({slots.length})</label>
          <Button className="btn-off" onClick={() => openSlot(null)}>
            <Plus className="w-4 h-4" />
            <span>Add slot</span>
          </Button>
        </div>

        {/* SLOT LIST */}
        {slots.length === 0 ? (

          // EMPTY STATE
          <p className="text-subtle">No slots yet. Each slot is one exercise the engine fills per session.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {slots.map((slot, index) => (

              // SLOT ROW
              <div key={index} className="card">
                <div className="flex flex-row items-center gap-2 px-3 py-2">

                  {/* SUMMARY */}
                  <div className="flex-1 min-w-0">
                    <span className="text-primary">{slotSummary(slot)}</span>
                  </div>

                  {/* MOVE UP */}
                  <Button className="btn-off" onClick={() => moveSlot(index, -1)} disabled={index === 0} aria-label="Move up">
                    <ArrowUp className="w-4 h-4" />
                  </Button>

                  {/* MOVE DOWN */}
                  <Button className="btn-off" onClick={() => moveSlot(index, 1)} disabled={index === slots.length - 1} aria-label="Move down">
                    <ArrowDown className="w-4 h-4" />
                  </Button>

                  {/* EDIT */}
                  <Button className="btn-off" onClick={() => openSlot(index)} aria-label="Edit slot">
                    <Pencil className="w-4 h-4" />
                  </Button>

                  {/* REMOVE */}
                  <Button className="btn-off" onClick={() => removeSlot(index)} aria-label="Remove slot">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SLOT EDITOR (in-memory) */}
      {slotModalOpen && (
        <DaySlotModal
          isOpen={slotModalOpen}
          onClose={() => setSlotModalOpen(false)}
          onSubmitInput={acceptSlot}
          slot={null}
          initialInput={editingIndex === null ? undefined : slots[editingIndex]}
          nextOrderIndex={editingIndex === null ? slots.length + 1 : editingIndex + 1}
          muscleGroups={muscleGroups}
          exercises={exercises}
        />
      )}
    </Modal>
  );
}
