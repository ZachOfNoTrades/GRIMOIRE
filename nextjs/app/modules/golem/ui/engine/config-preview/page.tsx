'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoBack } from '@/lib/useGoBack';
import type { DayArchetype, DayArchetypeWithSlots, DaySlot } from '../../../types/dayArchetype';
import '../../settings/settings.css';
import '../../../components/rowDesignPreview.css';

// Read-only design-exploration surface for the unified expandable-row
// component. Three structural concepts, same live archetype/slot data as
// the real config page. Not linked from nav; delete once a direction ships.

// Program-filter sentinel keys (mirrors DayArchetypeConfig.tsx). Real program
// ids are GUIDs so these literals can never collide with one.
const PROGRAM_FILTER_ALL = 'all';
const PROGRAM_FILTER_NONE = 'none';

// Starting state of the group-by toggle. Grouped-by-program reads better as
// the first impression for this particular list (it's how the real page's
// program filter chips already implied structure existed); flip to false to
// default a future usage to a flat list instead.
const DEFAULT_GROUP_BY_PROGRAM = true;

const ROLE_HEX: Record<string, string> = {
  primary: 'var(--alert-green-text)', secondary: 'var(--alert-blue-text)', unilateral: 'var(--alert-blue-text)',
  isolation: 'var(--color-secondary)', core: 'var(--alert-yellow-text)', carry: 'var(--alert-yellow-text)',
  conditioning: 'var(--alert-yellow-text)',
};

function parseSlotSequence(sequence: string | null | undefined): { role: string; isWarmup: boolean }[] {
  if (!sequence) return [];
  return sequence.split(',').map((token) => {
    const [role, warmupFlag] = token.split(':');
    return { role, isWarmup: warmupFlag === '1' };
  });
}

function formatDose(slot: DaySlot): string {
  if (slot.progression_model === 'time_effort') {
    return slot.time_low_seconds != null && slot.time_high_seconds != null
      ? `${slot.set_target}×${slot.time_low_seconds}-${slot.time_high_seconds}s`
      : `${slot.set_target} sets`;
  }
  return `${slot.set_target}×${slot.rep_low}-${slot.rep_high}`;
}

const CONCEPTS = [
  { key: 'a', label: 'A · Ledger', blurb: 'No per-row boxes. One continuous hairline list with a single left rail; expanding a row extends that same rail down through its slots, so parent and child read as one program listing instead of a card nested in a card.' },
  { key: 'b', label: 'B · Split', blurb: 'Master/detail. The list stays a fixed-height, single-line scan column — clicking a row does not push anything down, it fills a persistent detail pane alongside it.' },
  { key: 'c', label: 'C · Tree', blurb: 'Borderless console listing. Disclosure markers and tree-branch characters instead of chrome; the composition strip becomes an inline block-character preview. Maximum density, minimum decoration.' },
] as const;

export default function ConfigDesignPreviewPage() {
  const goBack = useGoBack();
  const [concept, setConcept] = useState<(typeof CONCEPTS)[number]['key']>('a');

  const [archetypes, setArchetypes] = useState<DayArchetype[]>([]);
  const [slotsById, setSlotsById] = useState<Record<string, DaySlot[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the list, then preload every archetype's slots up front (parallel
  // fetch, one per row) so opening a row is a pure state flip — no per-row
  // fetch/spinner, just the open/close animation.
  useEffect(() => {
    (async () => {
      const res = await fetch('/modules/golem/api/day-archetypes');
      const data = await res.json();
      const list: DayArchetype[] = data.archetypes ?? [];
      setArchetypes(list);

      const details = await Promise.all(
        list.map((a) => fetch(`/modules/golem/api/day-archetypes/${a.id}`).then((r) => r.json()))
      );
      const bySlot: Record<string, DaySlot[]> = {};
      for (const d of details) if (d.archetype) bySlot[d.archetype.id] = d.archetype.slots;
      setSlotsById(bySlot);
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id));

  // Derived — the selected archetype, stitched from the preloaded slot map (no fetch on open).
  const selected: DayArchetypeWithSlots | null = useMemo(() => {
    if (!selectedId) return null;
    const base = archetypes.find((a) => a.id === selectedId);
    return base ? { ...base, slots: slotsById[selectedId] ?? [] } : null;
  }, [selectedId, archetypes, slotsById]);

  const active = CONCEPTS.find((c) => c.key === concept)!;

  return (
    <div className="page">
      <div className="page-container rdp-page">
        <div>
          <Button onClick={() => goBack('/modules/golem/ui/archetypes')} className="btn-link !pl-0">
            <ArrowLeft className="w-4 h-4" />
            <span>Day Archetypes</span>
          </Button>
          <h1 className="text-page-title gs-title">
            <CalendarDays className="w-6 h-6" />
            Expandable Row — Design Preview
          </h1>
          <p className="gs-subtitle">Read-only. Same live data as the real config page, three candidate row layouts.</p>
        </div>

        <div className="rdp-switcher">
          {CONCEPTS.map((c) => (
            <button key={c.key} className={concept === c.key ? 'is-active' : ''} onClick={() => setConcept(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="rdp-concept-label">{active.blurb}</p>

        {loading && (
          <div className="loading-container"><div className="loading-spinner" /></div>
        )}

        {!loading && concept === 'a' && (
          <ConceptLedger archetypes={archetypes} selected={selected} onToggle={toggle} />
        )}
        {!loading && concept === 'b' && (
          <ConceptSplit archetypes={archetypes} selected={selected} onToggle={toggle} />
        )}
        {!loading && concept === 'c' && (
          <ConceptTree archetypes={archetypes} selected={selected} onToggle={toggle} />
        )}
      </div>
    </div>
  );
}

type ListProps = {
  archetypes: DayArchetype[];
  selected: DayArchetypeWithSlots | null;
  onToggle: (id: string) => void;
};

/* ============ CONCEPT A — LEDGER ============ */
function ConceptLedger({ archetypes, selected, onToggle }: ListProps) {
  return (
    <div className="rdp-a-list">
      {archetypes.map((a, i) => {
        const isOpen = selected?.id === a.id;
        const slotCount = isOpen ? selected.slots.length : (a.slot_count ?? 0);
        return (
          <div key={a.id}>
            <div className={`rdp-a-row ${isOpen ? 'is-open' : ''}`} onClick={() => onToggle(a.id)}>
              <span className="rdp-a-caret">{isOpen ? '▾' : '▸'}</span>
              <span className="rdp-a-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-card-title">{a.name}</span>
                  <span className="badge-gray inline-flex items-center gap-1 tabular-nums">{slotCount} {slotCount === 1 ? 'slot' : 'slots'}</span>
                  {a.program_name && <span className="badge-blue inline-flex items-center gap-1">{a.program_name}</span>}
                </div>
                {a.description && <p className="text-secondary text-sm truncate mt-0.5">{a.description}</p>}
                {!isOpen && a.slot_sequence && (
                  <div className="rdp-a-strip">
                    {parseSlotSequence(a.slot_sequence).map((t, idx) => (
                      <span key={idx} className={`rdp-a-tick ${t.isWarmup ? '' : 'rdp-a-tick--filled'}`} style={{ color: ROLE_HEX[t.role] ?? 'var(--color-primary)' }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button className="btn-link" aria-label={`Edit ${a.name}`}><Pencil className="w-4 h-4" /></Button>
                <Button className="btn-link-red" aria-label={`Delete ${a.name}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            {isOpen && (
              <div key={selected.id} className="rdp-a-slots rdp-open-anim">
                {selected.slots.map((s, idx) => (
                  <div key={s.id} className="rdp-a-slot">
                    <span className="rdp-a-slot-num">{idx + 1}</span>
                    <span className="slot-role" style={{ color: ROLE_HEX[s.role] ?? 'var(--color-primary)' }}>{s.role}</span>
                    <span className="text-secondary">{s.pinned_exercise_name ?? 'auto'} · {formatDose(s)}{s.target_rpe != null ? ` · RPE ${s.target_rpe}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Fixed scroll rate (px/sec, roughly 6 characters/sec at this font) — every
// marquee moves at the same speed regardless of how much text overflows;
// longer overflow just takes proportionally longer to finish scrolling, it
// doesn't scroll faster.
const MARQUEE_PX_PER_SEC = 45;
const MARQUEE_MIN_SCROLL_MS = 400; // floor so tiny overflows don't whip past unreadably fast
const MARQUEE_START_HOLD_MS = 300; // brief pause before scrolling begins
// Fixed regardless of text length — a long name and a short one both get the
// same amount of time to actually read the revealed tail before it resets.
// (CSS %-based keyframes can't express "fixed ms" once duration varies per
// element, which is why this uses the Web Animations API instead.)
const MARQUEE_END_HOLD_MS = 1500;
const MARQUEE_SNAP_MS = 80; // fast reset back to the start, not an eased slide
const MARQUEE_LOOP_GAP_MS = 300; // pause at rest before the next sweep

// Truncated text that, while its row is hovered (desktop only — hover isn't
// started unless the device actually supports :hover), scrolls at a fixed
// rate to reveal what the ellipsis cut off, holds there for a beat, then
// snaps back and restarts — a one-way sweep, not a seesaw. Only overflowing
// text gets the animation (measured on mount/resize); text that already
// fits stays put instead of needlessly sliding around.
function MarqueeText({ text, hovered }: { text: string; hovered: boolean }) {
  const innerRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => setOverflowPx(Math.max(0, el.scrollWidth - parent.clientWidth));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text]);

  useEffect(() => {
    const el = innerRef.current;
    animRef.current?.cancel();
    animRef.current = null;
    if (!el || !hovered || overflowPx <= 0) return;
    if (!window.matchMedia?.('(hover: hover)').matches) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const dist = overflowPx + 10;
    const scrollMs = Math.max(MARQUEE_MIN_SCROLL_MS, (dist / MARQUEE_PX_PER_SEC) * 1000);
    const total = MARQUEE_START_HOLD_MS + scrollMs + MARQUEE_END_HOLD_MS + MARQUEE_SNAP_MS + MARQUEE_LOOP_GAP_MS;
    const at = (ms: number) => ms / total;

    animRef.current = el.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: at(MARQUEE_START_HOLD_MS) },
        { transform: `translateX(-${dist}px)`, offset: at(MARQUEE_START_HOLD_MS + scrollMs) },
        { transform: `translateX(-${dist}px)`, offset: at(MARQUEE_START_HOLD_MS + scrollMs + MARQUEE_END_HOLD_MS) },
        { transform: 'translateX(0)', offset: at(MARQUEE_START_HOLD_MS + scrollMs + MARQUEE_END_HOLD_MS + MARQUEE_SNAP_MS) },
        { transform: 'translateX(0)', offset: 1 },
      ],
      { duration: total, iterations: Infinity, easing: 'linear' },
    );
    return () => { animRef.current?.cancel(); animRef.current = null; };
  }, [hovered, overflowPx]);

  return (
    <span className="rdp-marquee">
      <span ref={innerRef} className="rdp-marquee-inner" data-overflow={overflowPx > 0 || undefined}>
        {text}
      </span>
    </span>
  );
}

/* ============ CONCEPT B — SPLIT ============
   Desktop: two-pane master/detail, both visible at once.
   Mobile (<=640px): collapses to one column — the detail pane takes over
   full-width when a row is open, with a back control to return to the list,
   instead of squeezing both panes side by side. */
function ConceptSplit({ archetypes, selected, onToggle }: ListProps) {
  const detailActive = !!selected;
  const back = () => { if (selected) onToggle(selected.id); };

  // Warmup / working split — same grouping the session page uses (day
  // archetype preview + logged-segment sections), so a slot's warm-up-ness
  // reads from which section it's in rather than a per-row tag.
  const warmupSlots = selected?.slots.filter((s) => s.is_warmup) ?? [];
  const workingSlots = selected?.slots.filter((s) => !s.is_warmup) ?? [];

  // GROUP BY — toggleable; demoed with "program" vs "none" (flat). Real usage
  // would key by whatever dimension makes sense for that list. Default is a
  // named constant (not just an inline `true`) since it's a real config
  // choice a real usage of this component would want to set explicitly.
  const [groupByProgram, setGroupByProgram] = useState(DEFAULT_GROUP_BY_PROGRAM);

  // FILTER BY — same program-filter-bar pattern (+ sentinels) as the real
  // DayArchetypeConfig.tsx, demoed as: all programs / one program / unassigned.
  const [programFilter, setProgramFilter] = useState<string>(PROGRAM_FILTER_ALL);

  // Filtering to one program (or Unassigned) makes grouping by program
  // meaningless — everything visible is already the same bucket. Disable
  // (not hide) the toggle so the setting isn't lost, just inapplicable
  // while the filter is active; grouping itself is force-flat underneath.
  const groupByDisabled = programFilter !== PROGRAM_FILTER_ALL;
  const effectiveGroupBy = groupByProgram && !groupByDisabled;

  const programBuckets = useMemo(() => {
    const byProgram = new Map<string, { name: string; count: number }>();
    let unassignedCount = 0;
    for (const a of archetypes) {
      if (a.program_id) {
        const bucket = byProgram.get(a.program_id);
        if (bucket) bucket.count += 1;
        else byProgram.set(a.program_id, { name: a.program_name ?? 'Untitled program', count: 1 });
      } else {
        unassignedCount += 1;
      }
    }
    const programs = [...byProgram.entries()]
      .map(([id, bucket]) => ({ id, ...bucket }))
      .sort((x, y) => x.name.localeCompare(y.name));
    return { programs, unassignedCount };
  }, [archetypes]);

  const visibleArchetypes = useMemo(() => {
    if (programFilter === PROGRAM_FILTER_ALL) return archetypes;
    if (programFilter === PROGRAM_FILTER_NONE) return archetypes.filter((a) => !a.program_id);
    return archetypes.filter((a) => a.program_id === programFilter);
  }, [archetypes, programFilter]);

  // Grouping demo: bucket by program, same gs-section/gs-group shape the
  // rest of golem groups menus with (GolemMenu). Named programs sorted
  // alphabetically; archetypes with no program fall into a trailing group
  // instead of being dropped. `name: null` means "don't render a header" —
  // used when grouping is off, so the list is one flat gs-group.
  const groups = useMemo(() => {
    if (!effectiveGroupBy) return [{ name: null as string | null, items: visibleArchetypes }];
    const byProgram = new Map<string, DayArchetype[]>();
    const unassigned: DayArchetype[] = [];
    for (const a of visibleArchetypes) {
      if (a.program_name) {
        const list = byProgram.get(a.program_name);
        if (list) list.push(a); else byProgram.set(a.program_name, [a]);
      } else {
        unassigned.push(a);
      }
    }
    const named = [...byProgram.entries()]
      .map(([name, items]) => ({ name: name as string | null, items }))
      .sort((x, y) => x.name!.localeCompare(y.name!));
    return unassigned.length > 0 ? [...named, { name: 'Unassigned', items: unassigned }] : named;
  }, [visibleArchetypes, effectiveGroupBy]);

  return (
    <div className={`rdp-b-layout ${detailActive ? 'rdp-b-detail-active' : ''}`}>

      {/* MASTER LIST — grouped by program (toggleable) + filterable to one program,
          rows in the standard gs-section/gs-row/gs-group pattern (GolemMenu,
          ui/settings/settings.css) rather than bespoke markup. */}
      <div className="rdp-b-list">

        {/* PROGRAM FILTER — above Group by, since which programs are even in
            view determines whether grouping by program still means anything.
            A dropdown rather than a chip row: chips stop scaling once there
            are more than a handful of programs, a select doesn't. Surfaces
            only once a program owns archetypes; otherwise every day is
            unassigned and the filter is just noise. */}
        {programBuckets.programs.length > 0 && (
          <div className="rdp-control-row">
            <span className="filter-bar-label shrink-0">Program</span>
            <select
              className="input-field flex-1"
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
            >
              <option value={PROGRAM_FILTER_ALL}>All programs ({archetypes.length})</option>
              {programBuckets.programs.map((program) => (
                <option key={program.id} value={program.id}>{program.name} ({program.count})</option>
              ))}
              {programBuckets.unassignedCount > 0 && (
                <option value={PROGRAM_FILTER_NONE}>Unassigned ({programBuckets.unassignedCount})</option>
              )}
            </select>
          </div>
        )}

        {/* GROUP-BY TOGGLE — a real switch, not a 2-chip choice; chips read as
            "pick one of these options" which fits the program filter above
            better than an on/off setting. Disabled (not hidden) once the
            program filter narrows to one bucket — the switch keeps whatever
            the user last set it to, it just can't do anything while every
            visible row is already the same program. */}
        <div className="rdp-control-row">
          <label className={`rdp-toggle ${groupByDisabled ? 'is-disabled' : ''}`} title={groupByDisabled ? 'Not applicable while filtered to one program' : undefined}>
            <input
              type="checkbox"
              checked={groupByProgram}
              disabled={groupByDisabled}
              onChange={(e) => setGroupByProgram(e.target.checked)}
            />
            <span className="rdp-toggle-track"><span className="rdp-toggle-thumb" /></span>
            <span>Group by program</span>
          </label>
        </div>

        {/* FILTERED EMPTY STATE */}
        {visibleArchetypes.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">No day archetypes in this program</p>
            <p className="empty-state-body">Pick a different program above, or choose &ldquo;All&rdquo;.</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.name ?? '__flat__'}>

            {/* GROUP LABEL — omitted entirely when grouping is off */}
            {group.name && <h2 className="gs-section">{group.name}</h2>}

            {/* GROUP ROWS — program name dropped from the row body here since the
                section label (when grouped) already says it. */}
            <div className="gs-group">
              {group.items.map((a) => (
                <ArchetypeRow key={a.id} archetype={a} isOpen={selected?.id === a.id} onToggle={onToggle} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rdp-b-divider" />
      <div className="rdp-b-detail">

        {/* MOBILE BACK — hidden on desktop; collapses the detail pane back to the list */}
        <Button className="btn-link !pl-0 rdp-b-back" onClick={back}>
          <ArrowLeft className="w-4 h-4" />
          <span>Day Archetypes</span>
        </Button>

        {!selected && (
          <div className="rdp-b-detail-empty">Select a day archetype to view its slots</div>
        )}
        {selected && (
          /* Keyed on the archetype id so switching selection remounts this
             block and the open animation replays for the new content. */
          <div key={selected.id} className="rdp-open-anim">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-card-title flex items-center gap-2 flex-wrap">
                {selected.name}
                {selected.program_name && <span className="badge-blue inline-flex items-center gap-1">{selected.program_name}</span>}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <Button className="btn-link" aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                <Button className="btn-link-red" aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            {selected.description && <p className="text-secondary text-sm mb-3">{selected.description}</p>}

            {/* WARMUP SECTION — plain label, not collapsible (unlike the session
                page's Warmup group). It's the first thing in a short list; hiding
                it behind a toggle just adds a click to see slots that are already
                in view. */}
            {warmupSlots.length > 0 && (
              <>
                <h3 className="text-h3 mb-2">Warmup</h3>
                <div className="flex flex-col mb-3">
                  {warmupSlots.map((s, idx) => <SlotRow key={s.id} slot={s} num={idx + 1} />)}
                </div>
              </>
            )}

            {/* WORKING SECTION LABEL — only needed to disambiguate once a Warmup section exists above it */}
            {warmupSlots.length > 0 && <h3 className="text-h3 mt-3 mb-2">Working</h3>}

            {/* WORKING SLOT ROWS */}
            <div className="flex flex-col">
              {workingSlots.map((s, idx) => <SlotRow key={s.id} slot={s} num={idx + 1} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// A single row in the master list — 2 lines (title, warmup/working split).
// Program name is intentionally not shown here; the group it's nested under
// (see ConceptSplit's `groups`) already says which program it belongs to.
function ArchetypeRow({ archetype: a, isOpen, onToggle }: { archetype: DayArchetype; isOpen: boolean; onToggle: (id: string) => void }) {
  // slot_sequence already carries each slot's warmup flag (packed on the list
  // query for the old collapsed-row composition strip) — reuse it for the
  // warmup/working split instead of needing the row open.
  const seq = parseSlotSequence(a.slot_sequence);
  const warmupCount = seq.filter((t) => t.isWarmup).length;
  const workingCount = seq.length - warmupCount;
  const [isHovered, setIsHovered] = useState(false);

  return (
    /* ARCHETYPE ROW */
    <button
      type="button"
      className={`gs-row rdp-b-row ${isOpen ? 'is-selected' : ''}`}
      onClick={() => onToggle(a.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-current={isOpen ? 'true' : undefined}
    >

      {/* No leading icon tile — every candidate reuse site (rune deck cards,
          quest tasks, this day-archetype list) either has no natural per-item
          glyph or would just repeat the same decorative one on every row, so
          it's not earning its ~2.9rem (tile + gap). Reclaimed for row text. */}

      {/* ROW BODY — each line forced to one line; overflowing text marquees
          on hover instead of just ellipsis-ing */}
      <span className="gs-row-body">
        <span className="gs-row-label"><MarqueeText text={a.name} hovered={isHovered} /></span>
        <span className="gs-row-hint">{warmupCount} warmup · {workingCount} working</span>
      </span>

      {/* CHEVRON */}
      <ChevronRight className={`gs-row-chev w-5 h-5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
    </button>
  );
}

// A single slot line within the Warmup/Working detail sections. No per-row
// warm-up tag (section handles that) and no per-role text color — the role
// color now lives on the left-edge bar, same pattern as the session page's
// segment modal set rows (.bar-green/.bar-grey), generalized to any role hue.
function SlotRow({ slot: s, num }: { slot: DaySlot; num: number }) {
  return (
    <div className="rdp-b-slot">
      <span className="rdp-slot-bar" style={{ color: ROLE_HEX[s.role] ?? 'var(--color-primary)' }} />
      <div className="flex-1 min-w-0">
        {/* TITLE LINE — number sits inline with the role name (not a full-height
            gutter) so the two are vertically centered against each other rather
            than against the whole two-line row. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rdp-b-slot-num">{num}</span>
          <span className="slot-role">{s.role}</span>
          {s.target_muscle_name && <span className="text-secondary">· {s.target_muscle_name}</span>}
        </div>
        <p className="text-secondary text-sm mt-1">
          {s.pinned_exercise_name ?? 'auto'} · {formatDose(s)}{s.target_rpe != null ? ` · RPE ${s.target_rpe}` : ''}
        </p>
      </div>
    </div>
  );
}

/* ============ CONCEPT C — TERMINAL TREE ============ */
function ConceptTree({ archetypes, selected, onToggle }: ListProps) {
  return (
    <div className="rdp-c-list">
      {archetypes.map((a) => {
        const isOpen = selected?.id === a.id;
        const slotCount = isOpen ? selected.slots.length : (a.slot_count ?? 0);
        return (
          <div key={a.id}>
            <div className="rdp-c-row" onClick={() => onToggle(a.id)}>
              <span className="rdp-c-marker">{isOpen ? '▾' : '▸'}</span>
              <span className="rdp-c-name">{a.name}</span>
              <span className="rdp-c-meta">
                [{slotCount}]{a.program_name ? ` ${a.program_name}` : ''}
              </span>
              {!isOpen && a.slot_sequence && (
                <span className="rdp-c-meta rdp-c-blocks">
                  {parseSlotSequence(a.slot_sequence).map((t) => (t.isWarmup ? '·' : '█')).join('')}
                </span>
              )}
            </div>
            {isOpen && (
              <div key={selected.id} className="rdp-c-children rdp-open-anim">
                {selected.slots.map((s, idx) => {
                  const isLast = idx === selected.slots.length - 1;
                  return (
                    <div key={s.id} className="rdp-c-child">
                      <span className="rdp-c-branch">{isLast ? '  └─' : '  ├─'}</span>
                      <span className="slot-role" style={{ color: ROLE_HEX[s.role] ?? 'var(--color-primary)' }}>{s.role}</span>
                      <span>{s.pinned_exercise_name ?? 'auto'} · {formatDose(s)}{s.target_rpe != null ? ` · RPE ${s.target_rpe}` : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
