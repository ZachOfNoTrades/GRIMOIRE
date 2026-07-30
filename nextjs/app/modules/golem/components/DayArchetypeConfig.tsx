'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, CalendarDays, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExpandableRowList from '@/components/ExpandableRowList';
import type { DayArchetype, DayArchetypeWithSlots, DaySlot, DaySlotInput } from '../types/dayArchetype';
import DaySlotModal from './DaySlotModal';
import DayArchetypeModal from './DayArchetypeModal';
import ArchetypeBuilder from './ArchetypeBuilder';
import { useConfirm } from '@/lib/useConfirm';
import './dayArchetypeConfig.css';

// Slot role → syntax-highlight tone (maps onto the .slot-role--* classes in
// globals.css). Tiers: primary=anchor, secondary/unilateral=accessory compound,
// isolation=muted, core/carry/conditioning=effort. Seeded/unknown roles fall back.
const ROLE_TONE: Record<string, string> = {
  primary: 'primary',
  secondary: 'secondary',
  unilateral: 'unilateral',
  isolation: 'isolation',
  core: 'core',
  carry: 'carry',
  conditioning: 'conditioning',
};

// Progression model → compact human label for the spec readout (raw enum is the fallback).
const MODEL_LABEL: Record<string, string> = {
  double_progression: 'double prog',
  linear: 'linear',
  rpe_pct1rm: 'RPE→%1RM',
  time_effort: 'time/effort',
};

// Format a slot's dose. Three shapes: timed range (time_effort w/ duration),
// open set target (time_effort, no range), or reps range.
function formatDose(slot: DaySlot): string {
  if (slot.progression_model === 'time_effort') {
    return slot.time_low_seconds != null && slot.time_high_seconds != null
      ? `${slot.set_target}×${slot.time_low_seconds}-${slot.time_high_seconds}s` // cardio dose
      : `${slot.set_target} sets`;                                              // strength hold — open target
  }
  return `${slot.set_target}×${slot.rep_low}-${slot.rep_high}`;
}

// Parse the list query's packed "role:is_warmup" tokens (see getDayArchetypes)
// into the collapsed-row composition strip's tick data, in engine walk order.
function parseSlotSequence(sequence: string | null | undefined): { role: string; isWarmup: boolean }[] {
  if (!sequence) return [];
  return sequence.split(',').map((token) => {
    const [role, warmupFlag] = token.split(':');
    return { role, isWarmup: warmupFlag === '1' };
  });
}

// Convert a slot row back into an editable input (used for reorder PUTs).
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

// Config surface for day archetypes + their slots (the engine generates against these).
export default function DayArchetypeConfig() {
  const { confirm, confirmModal } = useConfirm();

  // DATA
  const [archetypes, setArchetypes] = useState<DayArchetype[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<{ id: string; name: string }[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<DayArchetypeWithSlots | null>(null);

  // STATE
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);   // archetype whose slots are mid-fetch (accordion spinner)
  const [archetypeModalOpen, setArchetypeModalOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false); // full create flow (name + slots)
  const [editingArchetype, setEditingArchetype] = useState<DayArchetype | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<DaySlot | null>(null);

  // Derived — archetypes sorted into contiguous per-program runs (alphabetical,
  // unassigned last), preserving each program's original relative order.
  // ExpandableRowList's getSectionLabel/getFilterValue grouping only detects
  // where one run ends and the next begins — it doesn't sort, so the caller
  // has to hand it pre-grouped order (mirrors rune's categorySortedCards).
  const orderedArchetypes = useMemo(() => {
    const byProgram = new Map<string, DayArchetype[]>();
    const unassigned: DayArchetype[] = [];
    for (const a of archetypes) {
      if (a.program_name) {
        const list = byProgram.get(a.program_name);
        if (list) list.push(a); else byProgram.set(a.program_name, [a]);
      } else {
        unassigned.push(a);
      }
    }
    const named = [...byProgram.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .flatMap(([, list]) => list);
    return [...named, ...unassigned];
  }, [archetypes]);

  const loadArchetypes = useCallback(async () => {
    const res = await fetch('/modules/golem/api/day-archetypes');
    const data = await res.json();
    setArchetypes(data.archetypes ?? []);
  }, []);

  // Load archetypes + dropdown options on mount.
  useEffect(() => {
    (async () => {
      try {
        const [, mg, ex] = await Promise.all([
          loadArchetypes(),
          fetch('/modules/golem/api/muscle-groups').then((r) => r.json()),
          fetch('/modules/golem/api/exercises').then((r) => r.json()),
        ]);
        setMuscleGroups(Array.isArray(mg) ? mg : []);
        setExercises((ex?.exercises ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
      } catch {
        toast.error('Failed to load config data');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadArchetypes]);

  // Open an archetype (load its slots).
  const openArchetype = async (id: string) => {
    const res = await fetch(`/modules/golem/api/day-archetypes/${id}`);
    const data = await res.json();
    if (res.ok) setSelected(data.archetype);
    else toast.error(data.error || 'Failed to load archetype');
  };

  // Deep link: ?archetype=<id> (e.g. from a session's segment modal) auto-opens that archetype once loaded.
  useEffect(() => {
    if (loading) return;
    const id = new URLSearchParams(window.location.search).get('archetype');
    if (id && selected?.id !== id && archetypes.some((a) => a.id === id)) {
      setOpeningId(id);
      openArchetype(id).finally(() => setOpeningId(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Row selection for the shared master/detail list — openingId takes priority
  // over selected.id so the detail pane switches (and shows its spinner)
  // immediately on click, rather than waiting for the fetch to resolve.
  const uiSelectedId = openingId ?? selected?.id ?? null;

  // Toggle: collapse if already open (or opening), otherwise fetch + open the
  // detail pane (openingId drives the inline spinner until slots arrive).
  const toggleArchetype = (id: string) => {
    if (uiSelectedId === id) {
      setSelected(null);
      setOpeningId(null);
      return;
    }
    setOpeningId(id);
    openArchetype(id).finally(() => setOpeningId(null));
  };

  // Warmup/working slot breakdown for a row's hint — freshest data when the
  // row is the loaded selection, otherwise the list query's packed sequence.
  const slotBreakdown = useCallback((a: DayArchetype) => {
    if (selected?.id === a.id) {
      const warmup = selected.slots.filter((s) => s.is_warmup).length;
      return { warmup, working: selected.slots.length - warmup };
    }
    const seq = parseSlotSequence(a.slot_sequence);
    const warmup = seq.filter((t) => t.isWarmup).length;
    return { warmup, working: seq.length - warmup };
  }, [selected]);

  // Re-fetch the currently selected archetype after a slot change.
  const refreshSelected = async () => {
    if (selected) await openArchetype(selected.id);
  };

  const deleteArchetype = async (id: string) => {
    if (!(await confirm({ title: 'Delete Archetype', message: 'Delete this archetype and all its slots?', confirmLabel: 'Delete', danger: true }))) return;
    const res = await fetch(`/modules/golem/api/day-archetypes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (selected?.id === id) setSelected(null);
      toast.success('Deleted');
      await loadArchetypes();
    } else toast.error('Delete failed');
  };

  const deleteSlot = async (slotId: string) => {
    if (!(await confirm({ title: 'Remove Slot', message: 'Remove this slot?', confirmLabel: 'Remove', danger: true }))) return;
    const res = await fetch(`/modules/golem/api/day-slots/${slotId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Slot removed'); await refreshSelected(); }
    else toast.error('Remove failed');
  };

  // Swap a slot's order_index with its neighbour (two PUTs), then refresh.
  const moveSlot = async (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const slots = selected.slots;
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    setReordering(true);
    try {
      const a = slots[index];
      const b = slots[target];
      await Promise.all([
        fetch(`/modules/golem/api/day-slots/${a.id}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...slotToInput(a), order_index: b.order_index }),
        }),
        fetch(`/modules/golem/api/day-slots/${b.id}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...slotToInput(b), order_index: a.order_index }),
        }),
      ]);
      await refreshSelected();
    } catch {
      toast.error('Reorder failed');
    } finally {
      setReordering(false);
    }
  };

  // Open the slot modal for add (null) or edit.
  const openSlotModal = (slot: DaySlot | null) => {
    setEditingSlot(slot);
    setSlotModalOpen(true);
  };

  // Open the archetype modal for create (null) or edit.
  const openArchetypeModal = (archetype: DayArchetype | null) => {
    setEditingArchetype(archetype);
    setArchetypeModalOpen(true);
  };

  if (loading) {
    /* LOADING PLACEHOLDER */
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    /* CONFIG LAYOUT */
    <div className="flex flex-col gap-6">

      {/* ARCHETYPE LIST CARD */}
      <div className="card">

        {/* HEADER */}
        <div className="card-header">

          {/* TITLE */}
          <h3 className="text-card-title flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            <span>Day Archetypes</span>
          </h3>

          {/* NEW ARCHETYPE — full build (name + slots) */}
          <Button className="btn-blue" onClick={() => setBuilderOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>New</span>
          </Button>
        </div>

        {/* LIST */}
        <div className="card-content">

          {/* EMPTY STATE */}
          {archetypes.length === 0 && (
            <div className="empty-state">
              <p className="empty-state-title">No day archetypes yet</p>
              <p className="empty-state-body">Create one (e.g. &ldquo;Leg Day&rdquo;) and add slots the engine will generate against.</p>
            </div>
          )}

          {/* ARCHETYPE ROW LIST — shared master/detail component; selecting a row
              fetches (or reuses) its slots into the detail pane alongside it.
              Search/filter/group are the component's own built-in controls
              (rendered inside its list column), same as rune's card list —
              not bespoke page-level controls. */}
          {archetypes.length > 0 && (
            <ExpandableRowList
              items={orderedArchetypes}
              getId={(a) => a.id}
              selectedId={uiSelectedId}
              onToggle={toggleArchetype}
              filterLabel="Program"
              getFilterValue={(a) => a.program_name ?? null}
              filterUncategorizedLabel="Unassigned"
              getSectionLabel={(a) => a.program_name || 'Unassigned'}
              groupToggleLabel="Group by program"
              renderLabel={(a) => a.name}
              renderHint={(a) => {
                const { warmup, working } = slotBreakdown(a);
                const base = `${warmup} warmup · ${working} working`;
                return a.program_name ? `${base} · ${a.program_name}` : base;
              }}
              backLabel="Day Archetypes"
              detailEmptyMessage="Select a day archetype to view its slots"
              renderDetailHeader={(a) => (
                <>
                  <h3 className="text-card-title flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    {a.name}
                    {a.program_name && <span className="badge-blue inline-flex items-center gap-1">{a.program_name}</span>}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button className="btn-link" onClick={() => openArchetypeModal(a)} aria-label={`Edit ${a.name}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button className="btn-link-red" onClick={() => deleteArchetype(a.id)} aria-label={`Delete ${a.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
              renderDetail={(a) => {
                // Fetch in flight (or stale relative to the just-clicked row) — spinner until it resolves.
                if (openingId === a.id || !selected || selected.id !== a.id) {
                  return (
                    <div className="loading-container">
                      <div className="loading-spinner" />
                    </div>
                  );
                }
                return (
                  <>
                    {/* DESCRIPTION */}
                    {a.description && <p className="text-secondary text-sm mb-3">{a.description}</p>}

                    {/* SLOTS SUB-HEADER */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-secondary text-sm inline-flex items-center gap-2">
                        <ListChecks className="w-4 h-4" />
                        {selected.slots.length} {selected.slots.length === 1 ? 'slot' : 'slots'}
                      </span>

                      {/* ADD SLOT */}
                      <Button className="btn-blue" onClick={() => openSlotModal(null)}>
                        <Plus className="w-4 h-4" />
                        <span>Add Slot</span>
                      </Button>
                    </div>

                    {/* EMPTY STATE */}
                    {selected.slots.length === 0 && (
                      <div className="empty-state">
                        <p className="empty-state-title">No slots yet</p>
                        <p className="empty-state-body">Add a slot to define what the engine generates for this day.</p>
                      </div>
                    )}

                    {/* SLOT ROWS */}
                    {selected.slots.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {selected.slots.map((s, index) => (

                          /* SLOT ROW — terminal spec readout; ordered left rail = engine walk order */
                          <div key={s.id} className="slot-row">

                            {/* GUTTER LINE NUMBER — the engine executes slots in this order, so the row is numbered like a program listing rather than badged */}
                            <span className="dac-gutter-num">{index + 1}</span>

                            {/* SLOT BODY */}
                            <div className="flex-1 min-w-0">

                              {/* TITLE ROW — role (syntax-highlighted) + target + flags, actions pinned right */}
                              <div className="flex items-start justify-between gap-2">

                                {/* ROLE + TARGET + FLAGS — only non-default flags shown (rotation cadence is edit-time detail, not a scan-time signal) */}
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span className={`slot-role slot-role--${ROLE_TONE[s.role] ?? 'default'}`}>{s.role}</span>
                                  {s.target_muscle_name && <span className="text-secondary">· {s.target_muscle_name}</span>}
                                  {s.is_warmup && <span className="badge-green inline-flex items-center gap-1">warm-up</span>}
                                  {s.is_optional && <span className="badge-yellow inline-flex items-center gap-1">optional</span>}
                                  {s.pinned_exercise_name && <span className="badge-blue inline-flex items-center gap-1">pinned</span>}
                                </div>

                                {/* ACTIONS — reorder, edit, delete (pinned top-right; reclaims the old full action row) */}
                                <div className="flex items-center gap-1 shrink-0">

                                  {/* MOVE UP */}
                                  <Button className="btn-off" disabled={reordering || index === 0} onClick={() => moveSlot(index, -1)} aria-label="Move slot up">
                                    <ArrowUp className="w-4 h-4" />
                                  </Button>

                                  {/* MOVE DOWN */}
                                  <Button className="btn-off" disabled={reordering || index === selected.slots.length - 1} onClick={() => moveSlot(index, 1)} aria-label="Move slot down">
                                    <ArrowDown className="w-4 h-4" />
                                  </Button>

                                  {/* EDIT */}
                                  <Button className="btn-off" onClick={() => openSlotModal(s)} aria-label="Edit slot">
                                    <Pencil className="w-4 h-4" />
                                  </Button>

                                  {/* DELETE */}
                                  <Button className="btn-link-red" onClick={() => deleteSlot(s.id)} aria-label="Remove slot">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {/* SPEC LINE — exercise · dose · RPE · model, unlabeled (the value shape already says what it is: "auto", "3×6-10", "RPE 8") */}
                              <p className="text-secondary text-sm mt-1">
                                <span className={s.pinned_exercise_name ? '' : 'text-muted'}>{s.pinned_exercise_name ?? 'auto'}</span>
                                <span className="text-muted"> · </span>
                                <span>{formatDose(s)}</span>
                                {s.target_rpe != null && (
                                  <>
                                    <span className="text-muted"> · </span>
                                    <span>RPE {s.target_rpe}</span>
                                  </>
                                )}
                                {!s.is_warmup && (
                                  <>
                                    <span className="text-muted"> · </span>
                                    <span className="text-muted">{MODEL_LABEL[s.progression_model] ?? s.progression_model}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* ARCHETYPE BUILDER — full create flow (name + slots) */}
      {builderOpen && (
        <ArchetypeBuilder
          isOpen={builderOpen}
          onClose={() => setBuilderOpen(false)}
          onCreated={async (id) => { await loadArchetypes(); setOpeningId(id); await openArchetype(id).finally(() => setOpeningId(null)); }}
          programId={null}
          muscleGroups={muscleGroups}
          exercises={exercises}
        />
      )}

      {/* ARCHETYPE MODAL — rename/description edit of an existing archetype */}
      {archetypeModalOpen && (
        <DayArchetypeModal
          isOpen={archetypeModalOpen}
          onClose={() => setArchetypeModalOpen(false)}
          onSaved={async () => { await loadArchetypes(); if (editingArchetype && selected?.id === editingArchetype.id) await openArchetype(editingArchetype.id); }}
          archetype={editingArchetype}
        />
      )}

      {/* SLOT MODAL */}
      {slotModalOpen && selected && (
        <DaySlotModal
          isOpen={slotModalOpen}
          onClose={() => setSlotModalOpen(false)}
          onSaved={refreshSelected}
          archetypeId={selected.id}
          slot={editingSlot}
          nextOrderIndex={(selected.slots.length ?? 0) + 1}
          muscleGroups={muscleGroups}
          exercises={exercises}
        />
      )}

      {/* DELETE CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
