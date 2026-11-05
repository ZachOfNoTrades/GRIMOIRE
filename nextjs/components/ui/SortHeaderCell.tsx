"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortDirection } from "@/types/sortDirection";

// Draw a column header that sorts its table by that column when clicked
export default function SortHeaderCell({
  label,
  direction,
  onSort,
}: {
  label: string;
  // The column's sort direction, or null when the table is sorted by another column.
  direction: SortDirection | null;
  onSort: () => void;
}) {
  const ariaSort = direction === null ? undefined : direction === SortDirection.Ascending ? "ascending" : "descending";
  return (
    <th scope="col" className="table-header-cell" aria-sort={ariaSort}>

      {/* SORT BUTTON */}
      <Button type="button" className="sort-header-button" onClick={onSort}>
        {label}
        {direction === null && <ChevronsUpDown className="sort-mark" aria-hidden="true" />}
        {direction === SortDirection.Ascending && <ChevronUp className="sort-mark sort-mark-active" aria-hidden="true" />}
        {direction === SortDirection.Descending && <ChevronDown className="sort-mark sort-mark-active" aria-hidden="true" />}
      </Button>
    </th>
  );
}
