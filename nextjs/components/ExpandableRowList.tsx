'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Fixed scroll rate (px/sec) — every marquee moves at the same speed
// regardless of how much text overflows; longer overflow just takes
// proportionally longer to finish scrolling, it doesn't scroll faster.
const MARQUEE_PX_PER_SEC = 45;
const MARQUEE_MIN_SCROLL_MS = 400; // floor so tiny overflows don't whip past unreadably fast
const MARQUEE_START_HOLD_MS = 300; // brief pause before scrolling begins
// Fixed regardless of text length — a long label and a short one both get
// the same amount of time to read the revealed tail before it resets.
const MARQUEE_END_HOLD_MS = 1500;
const MARQUEE_SNAP_MS = 80; // fast reset back to the start, not an eased slide
const MARQUEE_LOOP_GAP_MS = 300; // pause at rest before the next sweep

// Truncated row-label text that, while its row is hovered (desktop only —
// gated on actual hover support), scrolls at a fixed rate to reveal what the
// ellipsis cut off, holds there for a beat, then snaps back and restarts —
// a one-way sweep, not a seesaw. Only overflowing text ever animates.
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
    <span className="erow-marquee">
      <span ref={innerRef} className="erow-marquee-inner" data-overflow={overflowPx > 0 || undefined}>
        {text}
      </span>
    </span>
  );
}

export interface ExpandableRowListProps<T> {
  items: T[];
  getId: (item: T) => string;
  selectedId: string | null;
  onToggle: (id: string) => void;
  renderIcon?: (item: T) => React.ReactNode;
  renderLabel: (item: T) => string;
  renderHint?: (item: T) => React.ReactNode;
  // Optional tiny leading marker (e.g. a status dot) rendered at the row's left
  // edge, aligned with the label — unframed and narrow, unlike renderIcon's tile.
  // The slot is reserved for every row once this is passed (so labels stay
  // aligned); return null for rows with no marker.
  renderMarker?: (item: T) => React.ReactNode;
  // When set, the row label wraps up to this many lines (smaller font,
  // clamped with an ellipsis) instead of the default single-line +
  // marquee-on-hover truncation. Use for long free-text labels (e.g.
  // flashcard fronts) where reading a few wrapped lines beats a hover-scroll
  // preview of a single line.
  labelLines?: number;
  // Optional section grouping: when set, a header is rendered above each run
  // of consecutive items that share a label (each run also gets its own
  // bordered row group, matching a grouped Settings-style menu). Items must
  // already be pre-sorted into contiguous runs by the caller — this only
  // detects where one run ends and the next begins, it doesn't sort. Return
  // null for "no header" (e.g. an ungrouped leading run).
  getSectionLabel?: (item: T) => string | null;
  backLabel: string;
  detailEmptyMessage: string;
  renderDetailHeader?: (item: T) => React.ReactNode;
  renderDetail: (item: T) => React.ReactNode;
  // Optional bulk-selection: a "Select" button gates it off by default so
  // rows stay single-purpose (open detail on click) until the caller
  // actually needs multi-select. Controlled — the caller owns selectedIds
  // (e.g. for a bulk-delete button elsewhere on the page) and typically
  // uses the selectable state for the same purpose.
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  selectLabel?: string;
  // Optional client-side search: a text input above the list filters items
  // down to those matching the query. Matching runs against renderLabel by
  // default; pass getSearchText to also match hidden/secondary text (e.g. a
  // flashcard's back/notes, not just its front). The already-open detail
  // pane (if any) is left alone when a filter hides its row, so typing in
  // the box never yanks away what's currently open.
  searchable?: boolean;
  searchPlaceholder?: string;
  getSearchText?: (item: T) => string;
  // Optional single-value filter (e.g. a category): renders a <select> next to
  // search listing every distinct value returned by getFilterValue across items,
  // plus an "All" option. Applied before search and before section grouping —
  // filter narrows the set first, search then narrows further, and sections (if
  // getSectionLabel is used) only ever see what's left. Items where
  // getFilterValue returns null/empty are bucketed under filterUncategorizedLabel
  // rather than excluded.
  filterLabel?: string;
  getFilterValue?: (item: T) => string | null;
  filterUncategorizedLabel?: string;
  // Optional extra filter options appended to the SAME filter <select>, under their
  // own <optgroup>. Each carries a predicate deciding which items match when it's
  // picked — lets a caller fold an orthogonal facet (e.g. draft status) into the one
  // category dropdown instead of adding a second control. Requires getFilterValue
  // (the dropdown only renders when that's set). Selecting one applies its predicate
  // instead of the category value-match; grouping-by-category stays enabled since an
  // extra facet can still span categories. Values must not collide with the
  // FILTER_ALL / FILTER_UNCATEGORIZED sentinels or any getFilterValue result.
  filterExtraOptions?: { value: string; label: string; predicate: (item: T) => boolean }[];
  filterExtraGroupLabel?: string;
  // Optional "Group by X" toggle (same switch used by golem's DayArchetypeConfig
  // for its program grouping) — set this to enable it; requires getSectionLabel
  // too, since the toggle just decides whether that grouping is actually applied.
  // Defaults on. Auto-disabled (not hidden) once getFilterValue has narrowed the
  // list to a single bucket, same reasoning as DayArchetypeConfig: grouping is a
  // no-op when every visible row already shares one value. Hidden entirely when
  // there's nothing to group (0 or 1 distinct values across all items).
  groupToggleLabel?: string;
  // Caps the row list to roughly this many rows tall before it scrolls
  // internally instead of growing the page — measured from actual rendered
  // row heights (not a flat multiply), since rows vary in height (wrapped
  // labels, section headers). Pass 0 to disable the cap. Defaults to 10.
  maxItemsInView?: number;
}

// Shared master/detail row-list: desktop shows the list and a persistent
// detail pane side by side; mobile collapses to one column where selecting
// a row drills into a full-width detail view with a back control. See
// app/globals.css's "EXPANDABLE ROW LIST" section for the full class set.
const FILTER_ALL = '__erow_all__';
const FILTER_UNCATEGORIZED = '__erow_uncategorized__';

export default function ExpandableRowList<T>({
  items, getId, selectedId, onToggle, renderIcon, renderLabel, renderHint, renderMarker, labelLines, getSectionLabel,
  backLabel, detailEmptyMessage, renderDetailHeader, renderDetail,
  selectable, selectedIds, onSelectedIdsChange, selectLabel = 'Select',
  searchable, searchPlaceholder = 'Search…', getSearchText,
  filterLabel, getFilterValue, filterUncategorizedLabel = 'Uncategorized',
  filterExtraOptions, filterExtraGroupLabel,
  groupToggleLabel, maxItemsInView = 10,
}: ExpandableRowListProps<T>) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterValue, setFilterValue] = useState(FILTER_ALL);
  const [groupByEnabled, setGroupByEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const prevDetailActive = useRef(false);
  const [scrollMaxHeight, setScrollMaxHeight] = useState<number | undefined>(undefined);
  // Selection lookup always uses the full, unfiltered items — an open
  // detail pane stays open even if the current search text or filter would
  // hide its row from the list.
  const selected = selectedId ? items.find((item) => getId(item) === selectedId) ?? null : null;

  // Distinct filter values across ALL items (not the already-filtered set),
  // so picking one option doesn't remove the others from the dropdown.
  const filterOptions = getFilterValue
    ? Array.from(new Set(items.map(getFilterValue).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b))
    : [];
  const hasUncategorized = getFilterValue ? items.some((item) => !getFilterValue(item)) : false;
  const totalBuckets = filterOptions.length + (hasUncategorized ? 1 : 0);

  // A selected extra option (e.g. a draft-status facet) filters by its own
  // predicate; otherwise the category value-match applies as before.
  const activeExtraOption = filterExtraOptions?.find((o) => o.value === filterValue);
  const filteredByValue = activeExtraOption
    ? items.filter(activeExtraOption.predicate)
    : getFilterValue && filterValue !== FILTER_ALL
      ? items.filter((item) => (filterValue === FILTER_UNCATEGORIZED ? !getFilterValue(item) : getFilterValue(item) === filterValue))
      : items;

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? filteredByValue.filter((item) => (getSearchText ? getSearchText(item) : renderLabel(item)).toLowerCase().includes(query))
    : filteredByValue;

  // The toggle is disabled (not hidden) once the value filter has already
  // narrowed the list to one bucket — grouping becomes a no-op at that point
  // (every visible row already shares the same value), same reasoning as
  // DayArchetypeConfig's program-group toggle. It keeps whatever it was last
  // set to; disabling it doesn't force it on or off.
  // An extra-option facet (e.g. drafts) can still span categories, so it leaves
  // grouping enabled; only narrowing to a single category value makes it a no-op.
  const groupToggleDisabled = filterValue !== FILTER_ALL && !activeExtraOption;
  const showGroupToggle = !!(groupToggleLabel && getSectionLabel && totalBuckets > 1);
  const groupingActive = !!(getSectionLabel && (!showGroupToggle || groupByEnabled));

  // Bucket items into contiguous same-label runs (a no-op single run of
  // label=null when getSectionLabel isn't passed or grouping is toggled off).
  const sections: { label: string | null; items: T[] }[] = [];
  for (const item of visibleItems) {
    const label = groupingActive ? getSectionLabel!(item) : null;
    const run = sections[sections.length - 1];
    if (run && run.label === label) run.items.push(item);
    else sections.push({ label, items: [item] });
  }
  // Cap the list to roughly `maxItemsInView` rows tall, measured from actual
  // rendered row heights rather than a flat multiply — rows vary in height
  // (wrapped labels, section headers between groups), so "the Nth row's
  // bottom edge" is the real cutoff, not an estimate. Re-measures on resize
  // (font-size/viewport changes reflow row height) and whenever the visible
  // row count changes (search/filter/grouping all change which rows exist).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || maxItemsInView <= 0 || visibleItems.length <= maxItemsInView) {
      setScrollMaxHeight(undefined);
      return;
    }
    const measure = () => {
      const rows = container.querySelectorAll<HTMLElement>('.erow-row');
      const nth = rows[maxItemsInView - 1];
      if (!nth) { setScrollMaxHeight(undefined); return; }
      setScrollMaxHeight(nth.getBoundingClientRect().bottom - container.getBoundingClientRect().top);
    };
    measure();
    window.addEventListener('resize', measure);
    // Re-measure on any row insertion/removal directly, rather than relying
    // solely on `visibleItems.length` above — a newly-added row can commit to
    // the DOM a tick after this effect's own deps are diffed (optimistic
    // append followed by a background refetch), which otherwise left the cap
    // stuck at the pre-add height until something else (e.g. a reload)
    // forced a re-measure.
    const observer = new MutationObserver(measure);
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [visibleItems.length, maxItemsInView, groupingActive]);

  const detailActive = !!selected;
  const back = () => { if (selected) onToggle(getId(selected)); };

  // On mobile, opening a row's detail hides the list and swaps the full-width
  // detail into the list's place — which, under a tall page header, can land
  // below the fold so the tapped card's content isn't visible without a manual
  // scroll. When the detail first opens on a narrow viewport, pull the layout up
  // to the top of the viewport so the content is immediately in view. Desktop
  // shows list + detail side by side (no in-place swap), so it's skipped there.
  useEffect(() => {
    if (detailActive && !prevDetailActive.current
        && window.matchMedia?.('(max-width: 640px)').matches) {
      layoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevDetailActive.current = detailActive;
  }, [detailActive]);

  const allSelected = visibleItems.length > 0 && selectedIds?.size === visibleItems.length;
  const toggleSelectAll = () => {
    onSelectedIdsChange?.(allSelected ? new Set() : new Set(visibleItems.map(getId)));
  };
  const toggleSelected = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedIdsChange?.(next);
  };
  const exitSelecting = () => {
    setIsSelecting(false);
    onSelectedIdsChange?.(new Set());
  };

  return (
    <div ref={layoutRef} className={`erow-layout ${detailActive ? 'erow-detail-active' : ''}`}>

      {/* LIST */}
      <div className="erow-list">

        {/* SEARCH + FILTER ROW — search opt-in via `searchable`; filter opt-in via
            `getFilterValue`. Either can appear alone or both together. */}
        {(searchable || getFilterValue) && (
          <div className="erow-search-row">

            {/* SEARCH BAR — filters rows client-side */}
            {searchable && (
              <div className="erow-search">
                <Search className="erow-search-icon w-4 h-4" />
                <input
                  type="search"
                  className="input-field"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={searchPlaceholder}
                />
              </div>
            )}

            {/* FILTER SELECT — a single-value dropdown (e.g. category) */}
            {getFilterValue && (
              <select
                className="input-field erow-filter-select"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                aria-label={filterLabel ? `Filter by ${filterLabel}` : 'Filter'}
              >
                <option value={FILTER_ALL}>All{filterLabel ? ` ${filterLabel}` : ''}</option>
                {filterOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
                {hasUncategorized && <option value={FILTER_UNCATEGORIZED}>{filterUncategorizedLabel}</option>}
                {/* EXTRA OPTIONS — an orthogonal facet (e.g. draft status) folded into
                    the same dropdown under its own group, so it reads as a separate
                    axis from the category values above. */}
                {filterExtraOptions && filterExtraOptions.length > 0 && (
                  <optgroup label={filterExtraGroupLabel ?? 'Filter'}>
                    {filterExtraOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
        )}

        {/* GROUP-BY TOGGLE — disabled (not hidden) once the filter select has
            narrowed the list to one bucket; see groupToggleDisabled above. */}
        {showGroupToggle && (
          <div className="erow-toggle-row">
            <label className={`erow-toggle ${groupToggleDisabled ? 'is-disabled' : ''}`} title={groupToggleDisabled ? 'Not applicable while filtered to one value' : undefined}>
              <input
                type="checkbox"
                checked={groupByEnabled}
                disabled={groupToggleDisabled}
                onChange={(e) => setGroupByEnabled(e.target.checked)}
              />
              <span className="erow-toggle-track"><span className="erow-toggle-thumb" /></span>
              <span>{groupToggleLabel}</span>
            </label>
          </div>
        )}

        {/* SELECT BAR — gates the whole selection feature; only rendered
            when the caller opted in via `selectable`. */}
        {selectable && (
          <div className="erow-select-bar">
            {isSelecting ? (
              <>
                <label className="erow-select-all">
                  <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  <span>Select all</span>
                </label>
                <Button className="btn-link" onClick={exitSelecting}>Cancel</Button>
              </>
            ) : (
              <Button className="btn-link ml-auto" onClick={() => setIsSelecting(true)}>{selectLabel}</Button>
            )}
          </div>
        )}

        {/* NO MATCHES — search text and/or filter selection left nothing visible */}
        {(query || filterValue !== FILTER_ALL) && visibleItems.length === 0 && (
          <div className="erow-search-empty">
            {query ? <>No matches for &ldquo;{search.trim()}&rdquo;.</> : 'No matches for this filter.'}
          </div>
        )}

        {/* ROW SCROLL CONTAINER — capped to ~maxItemsInView rows tall (see the
            measuring effect above); scrolls internally once content exceeds
            that instead of growing the page. Uncapped (no inline maxHeight)
            when there aren't enough rows to need it. */}
        <div ref={scrollRef} className="erow-scroll" style={scrollMaxHeight ? { maxHeight: scrollMaxHeight, overflowY: 'auto' } : undefined}>
          {sections.map((section, sectionIndex) => (
            <Fragment key={`${section.label ?? '__flat__'}-${sectionIndex}`}>

              {/* SECTION HEADER — omitted for an untitled (ungrouped) run */}
              {section.label && <div className="erow-section">{section.label}</div>}

              <div className="erow-group">
                {section.items.map((item) => {
                  const id = getId(item);
                  return (
                    <Row
                      key={id}
                      id={id}
                      item={item}
                      isOpen={selectedId === id}
                      onToggle={onToggle}
                      renderIcon={renderIcon}
                      renderLabel={renderLabel}
                      renderHint={renderHint}
                      renderMarker={renderMarker}
                      labelLines={labelLines}
                      isSelecting={!!(selectable && isSelecting)}
                      isSelected={!!selectedIds?.has(id)}
                      onToggleSelected={toggleSelected}
                    />
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="erow-divider" />

      {/* DETAIL */}
      <div className="erow-detail">

        {/* MOBILE BACK — hidden on desktop; collapses the detail pane back to the list */}
        <Button className="btn-link !pl-0 erow-back" onClick={back}>
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </Button>

        {!selected && (
          <div className="erow-detail-empty">{detailEmptyMessage}</div>
        )}
        {selected && (
          /* Keyed on the item's id so switching selection remounts this
             block and the open animation replays for the new content. */
          <div key={getId(selected)} className="erow-open-anim">
            {renderDetailHeader && (
              <div className="flex items-start justify-between gap-2 mb-3">
                {renderDetailHeader(selected)}
              </div>
            )}
            {renderDetail(selected)}
          </div>
        )}
      </div>
    </div>
  );
}

function Row<T>({
  id, item, isOpen, onToggle, renderIcon, renderLabel, renderHint, renderMarker, labelLines,
  isSelecting, isSelected, onToggleSelected,
}: {
  id: string;
  item: T;
  isOpen: boolean;
  onToggle: (id: string) => void;
  renderIcon?: (item: T) => React.ReactNode;
  renderLabel: (item: T) => string;
  renderHint?: (item: T) => React.ReactNode;
  renderMarker?: (item: T) => React.ReactNode;
  labelLines?: number;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const handleActivate = () => (isSelecting ? onToggleSelected(id) : onToggle(id));

  // A native <button> can't legally contain interactive descendants (the
  // selection checkbox) — div+role="button" instead, same pattern the
  // original DayArchetypeConfig accordion row used for the same reason.
  return (
    <div
      role="button"
      tabIndex={0}
      className={`erow-row ${isOpen ? 'is-selected' : ''} ${labelLines ? 'erow-row--wrap' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-current={isOpen ? 'true' : undefined}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      {/* LEADING MARKER — a narrow, unframed slot for a status dot; the slot is
          reserved for every row (even when the marker is null) so labels stay
          aligned regardless of which rows are marked. */}
      {renderMarker && (
        <span className="erow-marker">{renderMarker(item)}</span>
      )}

      {/* ICON TILE — in selection mode this slot holds a checkbox instead
          (visual only; the row's own click drives the actual toggle, so the
          checkbox doesn't need its own interaction handling). */}
      {(isSelecting || renderIcon) && (
        <span className={`erow-icon ${isSelecting ? 'erow-icon--checkbox' : ''}`}>
          {isSelecting
            ? <input type="checkbox" className="checkbox" checked={isSelected} readOnly tabIndex={-1} />
            : renderIcon?.(item)}
        </span>
      )}

      {/* ROW BODY — label marquees on hover if it overflows (single-line mode);
          with labelLines set it wraps + clamps instead, so the marquee — which
          only makes sense for a single scrolling line — is skipped entirely. */}
      <span className="erow-row-body">
        {labelLines ? (
          <span className="erow-row-label erow-row-label--wrap" style={{ WebkitLineClamp: labelLines }}>
            {renderLabel(item)}
          </span>
        ) : (
          <span className="erow-row-label"><MarqueeText text={renderLabel(item)} hovered={isHovered} /></span>
        )}
        {renderHint && <span className="erow-row-hint">{renderHint(item)}</span>}
      </span>

      {/* CHEVRON — hidden while selecting; the row's click means "select", not "open" */}
      {!isSelecting && (
        <ChevronRight className={`erow-row-chev w-5 h-5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      )}
    </div>
  );
}
