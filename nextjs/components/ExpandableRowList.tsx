'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ArrowLeft, ChevronDown, ChevronRight, Rows3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchField, SMART_MATCH_HINT } from '@/components/SearchField';
import { makeSearchMatcher } from '@/lib/searchMatch';

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
  // Optional sort control, rendered on the filter's row (right edge) as a compact
  // icon+label button that CYCLES through these options in order — the same
  // control the forage food logger's Recipes tab and the Recipes page use. It is
  // deliberately not a second full-width <select>: two stacked dropdowns read as
  // one "settings block" and cost a whole row of vertical space above the list.
  // Keep the labels short (one or two words) — they are the button's face, not
  // dropdown options. Deliberately CONTROLLED and order-agnostic: the caller owns
  // `items`' order, exactly like getSectionLabel's contiguous-run contract — this
  // only renders the control and reports the chosen value back. Requires
  // sortValue + onSortChange.
  sortOptions?: { value: string; label: string }[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  // Plural noun for the aria-label ("cards" -> "Change cards sort order"),
  // matching the deck list's wording rather than the filter select's
  // "Filter by <singular>".
  sortLabel?: string;
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
  // Optional alternate TABLE presentation of the same items. The row list is a
  // master/detail: one item's detail at a time, everything else collapsed to its
  // label. A table trades that for seeing every item's full content at once, which
  // is a different job, not a better one — so both stay available behind a toggle.
  // The caller renders the table itself (columns are item-specific); this component
  // still owns search/filter/sort and hands over the SAME visible, ordered set the
  // rows would have shown, plus the selection state so the table can draw its own
  // checkbox column while "Select" mode is on. Controlled, like the sort toggle:
  // pass isTableView + onTableViewChange (the caller owns the view, e.g. to widen
  // its page container for the table). Section grouping and the row-count cap are
  // both suspended in table view — the point of it is one uninterrupted sweep of
  // everything, and the detail pane is redundant once every back is already visible,
  // so it (and its divider) drop out and the table takes the full width.
  renderTable?: (items: T[], selection: TableSelection) => React.ReactNode;
  isTableView?: boolean;
  onTableViewChange?: (isTableView: boolean) => void;
  // Caller controls that belong on the same line as "Select" rather than in a bar of their
  // own. The list already stacks search, filter/sort, group-by and select as full-width
  // rows; a caller adding one more (the table view's Edit / Save / Cancel) pushed the
  // content itself another line down the page for the sake of a single right-aligned
  // button. Rendered leading, so it reads "<caller's controls> ......... Select".
  toolbarExtra?: React.ReactNode;
  // Reports the rows the search/filter currently leaves visible, so a caller can act on the
  // narrowed set rather than the whole list — the deck page studies exactly the cards its
  // filter is showing. The list owns search and filter state (that is the point of it), so
  // this is the only way out for that set. Fired on change, not on every render.
  onVisibleItemsChange?: (items: T[]) => void;
  // Plural noun for the view toggle's aria-label ("cards" -> "Show cards as a table").
  tableViewLabel?: string;
}

// Selection state handed to renderTable so a table view can draw the same
// bulk-select checkboxes the rows do, driven by the list's own "Select" mode.
export interface TableSelection {
  isSelecting: boolean;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string) => void;
}

// Shared master/detail row-list: desktop shows the list and a persistent
// detail pane side by side; mobile collapses to one column where selecting
// a row drills into a full-width detail view with a back control. See
// app/globals.css's "EXPANDABLE ROW LIST" section for the full class set.
const FILTER_ALL = '__erow_all__';
const FILTER_UNCATEGORIZED = '__erow_uncategorized__';

// The filter dropdown's "All …" option reads as a plural ("All Categories", not
// "All Category"), while filterLabel itself stays singular for the aria-label
// ("Filter by Category"). Callers pass short noun labels, so the regular English
// rules cover every case in use; anything already plural is left alone.
function pluralizeFilterLabel(label: string) {
  if (/s$/i.test(label)) return label;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

export default function ExpandableRowList<T>({
  items, getId, selectedId, onToggle, renderIcon, renderLabel, renderHint, renderMarker, labelLines, getSectionLabel,
  backLabel, detailEmptyMessage, renderDetailHeader, renderDetail,
  selectable, selectedIds, onSelectedIdsChange, selectLabel = 'Select',
  searchable, searchPlaceholder = 'Search…', getSearchText,
  filterLabel, getFilterValue, filterUncategorizedLabel = 'Uncategorized',
  filterExtraOptions, filterExtraGroupLabel,
  sortOptions, sortValue, onSortChange, sortLabel,
  groupToggleLabel, maxItemsInView = 10,
  renderTable, isTableView, onTableViewChange, tableViewLabel, toolbarExtra, onVisibleItemsChange,
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

  // Matching goes through the shared normalizer, so a row written `5" bore`
  // answers to the query `5 inch` (and vice versa) and every query token has to
  // appear but need not be adjacent — see lib/searchMatch.ts. The matcher is
  // built once per query rather than per row.
  const query = search.trim();
  const matchesQuery = makeSearchMatcher(query);
  const visibleItems = query
    ? filteredByValue.filter((item) => matchesQuery(getSearchText ? getSearchText(item) : renderLabel(item)))
    : filteredByValue;

  // PUBLISH THE VISIBLE SET — compared by id list, not by array identity: `visibleItems` is
  // rebuilt on every render (it is a filter over a prop), so notifying on identity alone would
  // fire an endless loop of parent renders. The ids are what a caller acts on anyway.
  const visibleIdsKey = visibleItems.map(getId).join('\u0000');
  const lastVisibleKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onVisibleItemsChange) return;
    if (lastVisibleKeyRef.current === visibleIdsKey) return;
    lastVisibleKeyRef.current = visibleIdsKey;
    onVisibleItemsChange(visibleItems);
    // visibleItems is intentionally omitted — visibleIdsKey is its stable stand-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey, onVisibleItemsChange]);

  // The toggle is disabled (not hidden) once the value filter has already
  // narrowed the list to one bucket — grouping becomes a no-op at that point
  // (every visible row already shares the same value), same reasoning as
  // DayArchetypeConfig's program-group toggle. It keeps whatever it was last
  // set to; disabling it doesn't force it on or off.
  // An extra-option facet (e.g. drafts) can still span categories, so it leaves
  // grouping enabled; only narrowing to a single category value makes it a no-op.
  const groupToggleDisabled = filterValue !== FILTER_ALL && !activeExtraOption;
  // The sort picker needs all three halves of a controlled input to be useful;
  // any one missing means the caller isn't actually wired up for it.
  const showSortToggle = !!(sortOptions && sortOptions.length > 0 && sortValue !== undefined && onSortChange);
  // Cycling button state. An unrecognised sortValue falls back to index 0 so the
  // button still shows a label and still advances rather than dead-ending.
  const sortIndex = showSortToggle ? Math.max(0, sortOptions!.findIndex((option) => option.value === sortValue)) : -1;
  const activeSortOption = sortIndex >= 0 ? sortOptions![sortIndex] : undefined;
  const nextSortOption = sortIndex >= 0 ? sortOptions![(sortIndex + 1) % sortOptions!.length] : undefined;
  // Like the sort picker, the view toggle needs both halves of a controlled input
  // (the renderer and the change handler) before it is worth showing.
  const showViewToggle = !!(renderTable && onTableViewChange);
  const tableActive = !!(renderTable && isTableView);
  // Grouping is suspended in table view: section headers break the table into
  // separate <table>s (or bogus full-width rows), and the table is the "see it all
  // in one sweep" view, which is the opposite of what grouping is for.
  const showGroupToggle = !!(groupToggleLabel && getSectionLabel && totalBuckets > 1) && !tableActive;
  const groupingActive = !!(getSectionLabel && !tableActive && (!showGroupToggle || groupByEnabled));

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
    // Table view is deliberately uncapped — capping it would reintroduce the
    // scroll-a-few-at-a-time reading the table exists to replace.
    if (!container || tableActive || maxItemsInView <= 0 || visibleItems.length <= maxItemsInView) {
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
  }, [visibleItems.length, maxItemsInView, groupingActive, tableActive]);

  // Table view shows every back inline, so it never drives the detail pane —
  // a row left open in list view stays open underneath, ready for the way back.
  const detailActive = !!selected && !tableActive;
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
    <div ref={layoutRef} className={`erow-layout ${detailActive ? 'erow-detail-active' : ''} ${tableActive ? 'erow-table-mode' : ''}`}>

      {/* LIST */}
      <div className="erow-list">

        {/* SEARCH + FILTER + SORT ROW — search opt-in via `searchable`; filter opt-in
            via `getFilterValue`; sort opt-in via `sortOptions`; view toggle opt-in via
            `renderTable`. Any can appear alone or together. */}
        {(searchable || getFilterValue || showSortToggle || showViewToggle) && (
          <div className="erow-search-row">

            {/* SEARCH BAR — filters rows client-side */}
            {searchable && (
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={searchPlaceholder}
                matchHint={SMART_MATCH_HINT}
              />
            )}

            {/* FILTER + SORT ROW — the filter dropdown takes the width and the sort
                toggle rides its right edge (right-aligned on its own when there is
                no filter). Sharing one line is the point: sort used to be a second
                full-width <select> stacked under the filter, which read as a block
                of settings and pushed the list itself further down the page. */}
            {(getFilterValue || showSortToggle || showViewToggle) && (
            <div className="erow-filter-row">

            {/* FILTER SELECT — a single-value dropdown (e.g. category). The native
                dropmarker paints hard against the field's right border and no amount
                of padding-right moves it (padding only truncates the option text), so
                `appearance:none` drops it and the wrapper draws its own chevron at the
                same 0.75rem inset the field uses for its text. */}
            {getFilterValue && (
              <div className="erow-filter-select-wrap">
              <select
                className="input-field erow-filter-select"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                aria-label={filterLabel ? `Filter by ${filterLabel}` : 'Filter'}
              >
                <option value={FILTER_ALL}>All{filterLabel ? ` ${pluralizeFilterLabel(filterLabel)}` : ''}</option>
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

              {/* FILTER CHEVRON — decorative stand-in for the suppressed native
                  dropmarker; the <select> itself still owns every interaction. */}
              <ChevronDown className="erow-filter-select-chev w-4 h-4" aria-hidden="true" />
              </div>
            )}

            {/* CONTROL GROUP — sort + view ride the filter's right edge as one unit so
                that when the row has to wrap (narrow phone), they drop to the next line
                together instead of the filter select getting squeezed under its own
                longest option, or the two controls landing on separate lines. */}
            {(showSortToggle || showViewToggle) && (
            <div className="erow-filter-controls">

            {/* SORT TOGGLE — one tap advances to the next option and wraps; the
                caller applies the ordering. Same control as the forage food
                logger / Recipes page so a sort reads identically app-wide. */}
            {showSortToggle && (
              <button
                type="button"
                className="erow-sort-toggle text-muted"
                onClick={() => onSortChange!(nextSortOption!.value)}
                aria-label={sortLabel ? `Change ${sortLabel} sort order` : 'Change sort order'}
                title={`Sorted by ${activeSortOption!.label} — tap for ${nextSortOption!.label}`}
              >
                <ArrowDownUp className="w-3.5 h-3.5" />
                {activeSortOption!.label}
              </button>
            )}

            {/* VIEW TOGGLE — a two-state segmented control (rows / table) rather than a
                cycling button like sort: with only two views, a cycler can't show where
                you are and where you'd land at the same time, and the two icons say it
                without a label. Right edge, after sort, so the toolbar reads
                filter -> order -> shape. */}
            {showViewToggle && (
              <div className="erow-view-toggle" role="group" aria-label={tableViewLabel ? `${tableViewLabel} view` : 'View'}>
                <button
                  type="button"
                  className={`erow-view-option ${!tableActive ? 'is-active' : ''}`}
                  onClick={() => onTableViewChange!(false)}
                  aria-pressed={!tableActive}
                  aria-label={tableViewLabel ? `Show ${tableViewLabel} as a list` : 'Show as a list'}
                  title="List view"
                >
                  <Rows3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className={`erow-view-option ${tableActive ? 'is-active' : ''}`}
                  onClick={() => onTableViewChange!(true)}
                  aria-pressed={tableActive}
                  aria-label={tableViewLabel ? `Show ${tableViewLabel} as a table` : 'Show as a table'}
                  title="Table view"
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            </div>
            )}
            </div>
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

        {/* SELECT BAR — gates the whole selection feature; also the home for any caller
            controls passed as `toolbarExtra`, so the bar renders whenever either exists. */}
        {(selectable || toolbarExtra) && (
          <div className="erow-select-bar">
            {toolbarExtra}
            {selectable && (isSelecting ? (
              <>
                <label className="erow-select-all">
                  <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  <span>Select all</span>
                </label>
                <Button className="btn-link" onClick={exitSelecting}>Cancel</Button>
              </>
            ) : (
              <Button className="btn-link ml-auto" onClick={() => setIsSelecting(true)}>{selectLabel}</Button>
            ))}
          </div>
        )}

        {/* NO MATCHES — search text and/or filter selection left nothing visible */}
        {(query || filterValue !== FILTER_ALL) && visibleItems.length === 0 && (
          <div className="erow-search-empty">
            {query ? <>No matches for &ldquo;{search.trim()}&rdquo;.</> : 'No matches for this filter.'}
          </div>
        )}

        {/* TABLE VIEW — the caller's own table, fed the same filtered + ordered set
            the rows below would have rendered, plus the live selection state. */}
        {tableActive && renderTable!(visibleItems, { isSelecting: !!(selectable && isSelecting), isSelected: (id) => !!selectedIds?.has(id), toggleSelected })}

        {/* ROW SCROLL CONTAINER — capped to ~maxItemsInView rows tall (see the
            measuring effect above); scrolls internally once content exceeds
            that instead of growing the page. Uncapped (no inline maxHeight)
            when there aren't enough rows to need it. */}
        {!tableActive && (
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
        )}
      </div>

      {/* DETAIL — omitted entirely in table view (every back is already on screen),
          so the table gets the full width instead of sharing it with an empty pane. */}
      {!tableActive && (
      <>
      <div className="erow-divider" />

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
      </>
      )}
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
