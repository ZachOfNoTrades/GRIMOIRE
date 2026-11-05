import { SortDirection } from "@/types/sortDirection";

export type SortValue = string | number | null;

// Sort rows by one column in one direction, with blanks last in both and the rows' own order kept where they tie
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  return rows
    .map((row, index) => ({ row, index, sortValue: value(row) }))
    .sort((a, b) => {
      if (a.sortValue === null || b.sortValue === null) {
        if (a.sortValue === b.sortValue) return a.index - b.index;
        return a.sortValue === null ? 1 : -1;
      }
      const order = typeof a.sortValue === "number" && typeof b.sortValue === "number"
        ? a.sortValue - b.sortValue
        : String(a.sortValue).localeCompare(String(b.sortValue));
      if (order === 0) return a.index - b.index;
      return direction === SortDirection.Ascending ? order : -order;
    })
    .map((entry) => entry.row);
}
