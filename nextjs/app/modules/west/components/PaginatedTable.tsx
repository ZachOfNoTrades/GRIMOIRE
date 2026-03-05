"use client";

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, ReactNode, Ref } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

interface Column {
  header: string;
  headerClassName?: string;
}

interface PaginatedTableProps<T> {
  fetchUrl: (page: number, pageSize: number) => string;
  dataKey: string;
  columns: Column[];
  renderRow: (record: T) => ReactNode;
  emptyMessage?: string;
  containerClassName?: string;
  defaultPageSize?: number;
}

export interface PaginatedTableHandle {
  refresh: () => void;
}

function PaginatedTableInner<T>(
  {
    fetchUrl,
    dataKey,
    columns,
    renderRow,
    emptyMessage = "No records found",
    containerClassName = "min-h-[15rem] max-h-[calc(100vh-28rem)]",
    defaultPageSize = 10,
  }: PaginatedTableProps<T>,
  ref: Ref<PaginatedTableHandle>,
) {

  // DATA
  const [records, setRecords] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [pageInput, setPageInput] = useState("1");

  const cache = useRef<Map<string, { records: T[]; totalCount: number }>>(new Map());
  const isNavigating = useRef(false);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Sync page input when page changes
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Fetch a page, using cache if available
  const fetchPage = useCallback(async (page: number, size: number): Promise<{ records: T[]; totalCount: number }> => {
    const cacheKey = `${page}-${size}`;
    const cached = cache.current.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(fetchUrl(page, size));
    if (!response.ok) {
      throw new Error("Failed to fetch records");
    }
    const data = await response.json();
    const result = { records: data[dataKey], totalCount: data.totalCount };
    cache.current.set(cacheKey, result);
    return result;
  }, [fetchUrl, dataKey]);

  const loadPage = useCallback(async (page: number, size: number) => {
    setIsLoading(true);
    try {
      const data = await fetchPage(page, size);
      setRecords(data.records);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Error fetching paginated data:", error);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadPage(currentPage, pageSize);
  }, [currentPage, pageSize, loadPage]);

  const handlePageSizeChange = (newPageSize: number) => {
    cache.current.clear();
    setCurrentPage(1);
    setPageSize(newPageSize);
  };

  // Commit the typed page number, clamping to valid range
  const handlePageInputCommit = () => {
    // Skip if a button navigation already fired this interaction
    if (isNavigating.current) {
      isNavigating.current = false;
      return;
    }

    const parsed = parseInt(pageInput);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages && parsed !== currentPage) {
      setCurrentPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  // Navigate via button, flagging to suppress the competing onBlur commit
  const handleButtonNavigate = (page: number) => {
    isNavigating.current = true;
    setCurrentPage(page);
  };

  // Expose refresh to parent via ref
  useImperativeHandle(ref, () => ({
    refresh: () => {
      const cacheKey = `${currentPage}-${pageSize}`;
      cache.current.delete(cacheKey);
      loadPage(currentPage, pageSize);
    },
  }), [currentPage, pageSize, loadPage]);

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <>
      {/* TABLE */}
      <div className={`table-container transition-opacity duration-150 ${containerClassName} ${isLoading && !isInitialLoad ? "opacity-50 pointer-events-none" : ""}`}>
        <table className="table">

          {/* TABLE HEADERS */}
          <thead className="table-header">
            <tr className="table-header-row">
              {columns.map((column, index) => (
                <th key={index} className={`table-header-cell ${column.headerClassName ?? ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* TABLE ROWS */}
          <tbody className="table-body">

            {isInitialLoad ? (

              // LOADING PLACEHOLDER
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  <div className="loading-container">
                    <div className="loading-spinner" />
                  </div>
                </td>
              </tr>
            ) : records.length === 0 ? (

              // EMPTY PLACEHOLDER
              <tr>
                <td colSpan={columns.length} className="table-empty">{emptyMessage}</td>
              </tr>
            ) : (

              // RECORDS
              records.map((record) => renderRow(record))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION CONTROLS */}
      {totalCount > 0 && (
        <div className={`px-2 py-3 ${isLoading ? "pointer-events-none" : ""}`}>

          {/* MOBILE LAYOUT */}
          <div className="flex flex-col items-center gap-2 sm:hidden">

            {/* RECORD RANGE */}
            <span className="text-secondary text-sm">
              {startRecord}–{endRecord} of {totalCount}
            </span>

            {/* PAGE SIZE AND PAGE BUTTONS */}
            <div className="flex items-center justify-between w-full">

              {/* PAGE SIZE SELECTOR */}
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                className="input-field !py-1 !px-2 text-sm !w-auto"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>

              {/* PAGE BUTTONS */}
              <div className="flex items-center gap-1">

                {/* PREVIOUS BUTTON */}
                <Button
                  onClick={() => handleButtonNavigate(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="btn-link !px-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* PAGE INPUT */}
                <div className="flex items-center gap-1 text-sm">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={handlePageInputCommit}
                    onKeyDown={(e) => { if (e.key === "Enter") handlePageInputCommit(); }}
                    className="input-field !py-1 !px-1 text-sm text-center !w-12 !min-w-10"
                  />
                  <span className="text-secondary">/ {totalPages}</span>
                </div>

                {/* NEXT BUTTON */}
                <Button
                  onClick={() => handleButtonNavigate(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="btn-link !px-1.5"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* DESKTOP LAYOUT */}
          <div className="hidden sm:grid grid-cols-3 items-center">

            {/* PAGE SIZE SELECTOR (left) */}
            <div className="justify-self-start">
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                className="input-field !py-1 !px-2 text-sm !w-auto"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} / page</option>
                ))}
              </select>
            </div>

            {/* RECORD RANGE (center) */}
            <span className="text-secondary text-sm justify-self-center">
              {startRecord}–{endRecord} of {totalCount}
            </span>

            {/* PAGE BUTTONS (right) */}
            <div className="flex items-center gap-1 justify-self-end">

              {/* PREVIOUS BUTTON */}
              <Button
                onClick={() => handleButtonNavigate(currentPage - 1)}
                disabled={currentPage <= 1}
                className="btn-link !px-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {/* PAGE INPUT */}
              <div className="flex items-center gap-1 text-sm">
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={handlePageInputCommit}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePageInputCommit(); }}
                  className="input-field !py-1 !px-1 text-sm text-center !w-12 !min-w-10"
                />
                <span className="text-secondary">/ {totalPages}</span>
              </div>

              {/* NEXT BUTTON */}
              <Button
                onClick={() => handleButtonNavigate(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="btn-link !px-1.5"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const PaginatedTable = forwardRef(PaginatedTableInner) as <T>(
  props: PaginatedTableProps<T> & { ref?: Ref<PaginatedTableHandle> }
) => ReactNode;

export default PaginatedTable;
