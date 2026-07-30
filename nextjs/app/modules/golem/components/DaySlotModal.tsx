'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import type { DaySlot, DaySlotInput } from '../types/dayArchetype';

// Option lists + defaults for slot editing (shared with DayArchetypeConfig).
export const ROLES = ['primary', 'secondary', 'isolation', 'unilateral', 'core', 'carry', 'conditioning'];
export const MODELS = ['double_progression', 'linear', 'rpe_pct1rm', 'time_effort'];
export const CADENCES = ['per_session', 'per_block', 'never'];
export const CATEGORIES = ['Strength', 'Cardio', 'Mobility'];

export const DEFAULT_SLOT: DaySlotInput = {
  order_index: 1, role: 'secondary', target_muscle_group_id: null, category_filter: 'Strength',
  rotation_cadence: 'per_session', pinned_exercise_id: null, is_optional: false, is_warmup: false,
  progression_model: 'double_progression', rep_low: 8, rep_high: 12,
  time_low_seconds: null, time_high_seconds: null, target_rpe: 8,
  load_step_pct: 0.05, round_to_step: 5, set_target: 3,
};

// Short explanation of what each rotation cadence means to the engine.
const CADENCE_HELP: Record<string, string> = {
  per_session: 'Pick a fresh exercise every session.',
  per_block: 'Keep the same exercise within a training block, rotate between blocks.',
  never: 'Always use the pinned exercise (no rotation).',
};

// Short explanation of what each progression model does.
const MODEL_HELP: Record<string, string> = {
  double_progression: 'Add reps until the top of the range, then add load.',
  linear: 'Add a fixed load every session.',
  rpe_pct1rm: 'Prescribe load from estimated 1RM at the target RPE.',
  time_effort: 'Progress by time/effort (conditioning), not load.',
};

// Ensure a select can represent the current value even if it predates / isn't in the predefined list
// (e.g. a seeded role like "posterior"). Without this the select silently falls back to its first option.
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

// Build the editable DaySlotInput from an existing slot row.
function slotToInput(slot: DaySlot): DaySlotInput {
  return {
    order_index: slot.order_index, role: slot.role, target_muscle_group_id: slot.target_muscle_group_id,
    category_filter: slot.category_filter, rotation_cadence: slot.rotation_cadence,
    pinned_exercise_id: slot.pinned_exercise_id, is_optional: slot.is_optional, is_warmup: slot.is_warmup,
    progression_model: slot.progression_model, rep_low: slot.rep_low, rep_high: slot.rep_high,
    time_low_seconds: slot.time_low_seconds, time_high_seconds: slot.time_high_seconds,
    target_rpe: slot.target_rpe, load_step_pct: slot.load_step_pct, round_to_step: slot.round_to_step,
    set_target: slot.set_target,
  };
}

// Add/edit a single day slot. Pass slot=null to add (uses next order_index), or a slot to edit.
//
// Two modes:
//  - PERSISTED (default): pass `archetypeId`; the modal POSTs/PUTs the slot to the API itself.
//  - IN-MEMORY: pass `onSubmitInput`; the modal hands the assembled DaySlotInput back to the parent
//    (no network) — used by ArchetypeBuilder to collect slots before the archetype row exists.
export default function DaySlotModal({
  isOpen, onClose, onSaved, onSubmitInput, archetypeId, slot, initialInput, nextOrderIndex, muscleGroups, exercises,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onSubmitInput?: (input: DaySlotInput) => void;
  archetypeId?: string;
  slot: DaySlot | null;
  initialInput?: DaySlotInput; // in-memory edit pre-fill (when there's no persisted slot row yet)
  nextOrderIndex: number;
  muscleGroups: { id: string; name: string }[];
  exercises: { id: string; name: string }[];
}) {
  // INPUT
  const [form, setForm] = useState<DaySlotInput>(
    slot ? slotToInput(slot) : (initialInput ?? { ...DEFAULT_SLOT, order_index: nextOrderIndex }),
  );

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isTimeEffort = form.progression_model === 'time_effort'; // timed, not reps
  const showTimeRange = isTimeEffort && form.category_filter === 'Cardio'; // range is a cardio-only dose
  const isStrengthHold = isTimeEffort && !showTimeRange; // strength hold → no range, history-driven

  // Persist via POST (add) or PUT (edit), or hand the input back to the parent in in-memory mode.
  const handleSave = async () => {
    // Time range is cardio-only; null it out otherwise so stale values don't linger on the slot.
    const payload = showTimeRange ? form : { ...form, time_low_seconds: null, time_high_seconds: null };

    // IN-MEMORY MODE — no network; the parent owns persistence.
    if (onSubmitInput) {
      onSubmitInput(payload);
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const url = slot
        ? `/modules/golem/api/day-slots/${slot.id}`
        : `/modules/golem/api/day-archetypes/${archetypeId}/slots`;
      const res = await fetch(url, {
        method: slot ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(slot ? 'Failed to save slot' : 'Failed to add slot');
        return;
      }
      toast.success(slot ? 'Slot saved' : 'Slot added');
      onSaved?.();
      onClose();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    /* SLOT EDITOR MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={slot ? 'Edit Slot' : 'Add Slot'}
      disableClose={isSaving}
      footer={
        <>
          {/* CANCEL */}
          <Button onClick={onClose} disabled={isSaving} className="btn-link mr-auto">Cancel</Button>

          {/* SAVE */}
          <Button onClick={handleSave} disabled={isSaving} className="btn-blue">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isSaving ? 'Saving…' : 'Save'}</span>
          </Button>
        </>
      }
    >
      {/* FORM */}
      <div className="flex flex-col gap-4">

        {/* WARMUP SLOT TYPE — a warmup exercise (mobility/activation/cardio) the engine picks from your
            warmup exercises and places before the working slots. No load progression, so the loading
            fields (progression model, RPE, load tuning) are hidden when this is on. */}
        <div className="flex items-center gap-2">
          <input
            id="slot-is-warmup"
            type="checkbox"
            className="checkbox"
            checked={form.is_warmup}
            onChange={(e) => setForm({ ...form, is_warmup: e.target.checked })}
          />
          <label htmlFor="slot-is-warmup" className="text-secondary cursor-pointer">Warm-up slot (engine picks a warm-up exercise; runs before the working slots)</label>
        </div>

        {/* ROLE */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Role</label>
          <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {withCurrent(ROLES, form.role).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="text-secondary text-sm">The slot&apos;s job in the day (e.g. primary = main compound lift).</span>
        </div>

        {/* TARGET MUSCLE */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Target muscle</label>
          <select
            className="input-field"
            value={form.target_muscle_group_id ?? ''}
            onChange={(e) => setForm({ ...form, target_muscle_group_id: e.target.value || null })}
          >
            <option value="">(none)</option>
            {muscleGroups.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* CATEGORY */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Category</label>
          <select className="input-field" value={form.category_filter} onChange={(e) => setForm({ ...form, category_filter: e.target.value })}>
            {withCurrent(CATEGORIES, form.category_filter).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* PROGRESSION MODEL — working slots only (warmups have no load progression) */}
        {!form.is_warmup && (
          <div className="flex flex-col gap-1">
            <label className="text-secondary">Progression model</label>
            <select className="input-field" value={form.progression_model} onChange={(e) => setForm({ ...form, progression_model: e.target.value })}>
              {withCurrent(MODELS, form.progression_model).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-secondary text-sm">{MODEL_HELP[form.progression_model] ?? ''}</span>
          </div>
        )}

        {/* RANGE + SETS + RPE */}
        <div className="flex flex-wrap gap-3">

          {showTimeRange ? (
            <>
              {/* TIME LOW (s) */}
              <div className="flex flex-col gap-1">
                <label className="text-secondary">Time low (s)</label>
                <input
                  className="input-field w-24"
                  type="number"
                  value={form.time_low_seconds ?? ''}
                  onChange={(e) => setForm({ ...form, time_low_seconds: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>

              {/* TIME HIGH (s) */}
              <div className="flex flex-col gap-1">
                <label className="text-secondary">Time high (s)</label>
                <input
                  className="input-field w-24"
                  type="number"
                  value={form.time_high_seconds ?? ''}
                  onChange={(e) => setForm({ ...form, time_high_seconds: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
            </>
          ) : isStrengthHold ? (
            /* STRENGTH HOLD — no range; history-driven, self-report on first use */
            <div className="flex flex-col gap-1">
              <span className="text-secondary text-sm">
                Timed strength hold — no fixed target. The engine progresses from your logged duration; on the
                first session you self-report the hold time.
              </span>
            </div>
          ) : (
            <>
              {/* REP LOW */}
              <div className="flex flex-col gap-1">
                <label className="text-secondary">Rep low</label>
                <input className="input-field w-20" type="number" value={form.rep_low} onChange={(e) => setForm({ ...form, rep_low: Number(e.target.value) })} />
              </div>

              {/* REP HIGH */}
              <div className="flex flex-col gap-1">
                <label className="text-secondary">Rep high</label>
                <input className="input-field w-20" type="number" value={form.rep_high} onChange={(e) => setForm({ ...form, rep_high: Number(e.target.value) })} />
              </div>
            </>
          )}

          {/* SETS */}
          <div className="flex flex-col gap-1">
            <label className="text-secondary">Sets</label>
            <input className="input-field w-20" type="number" value={form.set_target} onChange={(e) => setForm({ ...form, set_target: Number(e.target.value) })} />
          </div>

          {/* TARGET RPE — working slots only (warmups aren't RPE-anchored) */}
          {!form.is_warmup && (
            <div className="flex flex-col gap-1">
              <label className="text-secondary">Target RPE</label>
              <input
                className="input-field w-20"
                type="number"
                step="0.5"
                value={form.target_rpe ?? ''}
                onChange={(e) => setForm({ ...form, target_rpe: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        {/* ROTATION CADENCE */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Rotation cadence</label>
          <select className="input-field" value={form.rotation_cadence} onChange={(e) => setForm({ ...form, rotation_cadence: e.target.value })}>
            {withCurrent(CADENCES, form.rotation_cadence).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-secondary text-sm">{CADENCE_HELP[form.rotation_cadence] ?? ''}</span>
        </div>

        {/* PINNED EXERCISE */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Pinned exercise</label>
          <select
            className="input-field"
            value={form.pinned_exercise_id ?? ''}
            onChange={(e) => setForm({ ...form, pinned_exercise_id: e.target.value || null })}
          >
            <option value="">(no pin — let the engine choose)</option>
            {exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </div>

        {/* OPTIONAL */}
        <div className="flex items-center gap-2">
          <input
            id="slot-optional"
            type="checkbox"
            className="checkbox"
            checked={form.is_optional}
            onChange={(e) => setForm({ ...form, is_optional: e.target.checked })}
          />
          <label htmlFor="slot-optional" className="text-secondary cursor-pointer">Optional (engine may skip if time/volume is tight)</label>
        </div>

        {/* ADVANCED TOGGLE — load tuning, working slots only (no load ramp on warmups) */}
        {!form.is_warmup && (
          <Button className="btn-link !pl-0" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>Advanced tuning</span>
          </Button>
        )}

        {/* ADVANCED FIELDS */}
        {!form.is_warmup && showAdvanced && (
          <div className="flex flex-wrap gap-3">

            {/* LOAD STEP PCT */}
            <div className="flex flex-col gap-1">
              <label className="text-secondary">Load step (%)</label>
              <input
                className="input-field w-24"
                type="number"
                step="1"
                value={Math.round((form.load_step_pct ?? 0) * 100)}
                onChange={(e) => setForm({ ...form, load_step_pct: Number(e.target.value) / 100 })}
              />
              <span className="text-secondary text-sm">Load jump when progressing.</span>
            </div>

            {/* ROUND TO STEP */}
            <div className="flex flex-col gap-1">
              <label className="text-secondary">Round to (lb)</label>
              <input
                className="input-field w-24"
                type="number"
                step="0.5"
                value={form.round_to_step}
                onChange={(e) => setForm({ ...form, round_to_step: Number(e.target.value) })}
              />
              <span className="text-secondary text-sm">Smallest plate/increment.</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
