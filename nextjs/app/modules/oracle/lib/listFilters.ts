import type { ReactNode } from "react";

/** One filter a list offers. `test` is the whole definition of what it keeps. */
export interface ListFilterDef<T, C = void> {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Filters sharing a group are alternatives: picking two widens the list (OR).
   *  Filters in different groups narrow it together (AND). Ungrouped filters are
   *  each their own group, so they stack. */
  group?: string;
  /** The heading this filter is listed under. Headings are about reading the menu; `group` is
   *  about how the filters combine, and the two do not have to line up. */
  section?: string;
  /** True when the filter is meaningless right now (no map open, say): it is still
   *  counted but is drawn disabled rather than offered as a dead end. */
  unavailable?: (context: C) => boolean;
  test: (item: T, context: C) => boolean;
}

/** One sort a list offers. `compare` runs before the list's own tie-break. */
export interface ListSortDef<T, C = void> {
  value: string;
  label: string;
  compare: (a: T, b: T, context: C) => number;
}

const groupOf = <T, C>(filter: ListFilterDef<T, C>) => filter.group ?? `#${filter.id}`;

/**
 * Apply the active filters to `items`, grouping as described on ListFilterDef: OR within a
 * group, AND across groups. An unknown or unavailable id is ignored rather than emptying the
 * list, so a stale id left in state cannot strand the user on a blank list.
 */
export function applyListFilters<T, C>(items: T[], filters: readonly ListFilterDef<T, C>[], active: readonly string[], context: C): T[] {
  const live = filters.filter((filter) => active.includes(filter.id) && !filter.unavailable?.(context));
  if (live.length === 0) return items;
  const groups = new Map<string, ListFilterDef<T, C>[]>();
  for (const filter of live) {
    const key = groupOf(filter);
    groups.set(key, [...(groups.get(key) ?? []), filter]);
  }
  return items.filter((item) => [...groups.values()].every((group) => group.some((filter) => filter.test(item, context))));
}

/**
 * How many items each filter would leave, measured against the other groups' active filters
 * rather than the whole list. That is what makes the numbers honest while filtering: a count
 * shown next to an option is what you would actually get by clicking it, so a zero means a
 * dead end rather than "none at all".
 */
export function countListFilters<T, C>(items: T[], filters: readonly ListFilterDef<T, C>[], active: readonly string[], context: C): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const filter of filters) {
    const others = active.filter((id) => {
      const other = filters.find((entry) => entry.id === id);
      return !!other && groupOf(other) !== groupOf(filter);
    });
    const pool = applyListFilters(items, filters, others, context);
    counts[filter.id] = filter.unavailable?.(context) ? 0 : pool.filter((item) => filter.test(item, context)).length;
  }
  return counts;
}

/** Toggle one filter id in the active set. */
export function toggleListFilter(active: readonly string[], id: string): string[] {
  return active.includes(id) ? active.filter((entry) => entry !== id) : [...active, id];
}
