"use client";

import { type ReactNode } from "react";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

export type Column = {
  /** Header text shown in the `<th>`. */
  header: string;
  /** Width hint for the skeleton placeholder (Tailwind width class, e.g. "w-16"). */
  skeletonWidth?: string;
  /** Skeleton variant — defaults to a plain `h-4` line; "badge" renders a rounded-full pill. */
  skeletonVariant?: "line" | "badge";
  /** Extra className on the `<th>` — use for alignment, e.g. "text-right". */
  headerClassName?: string;
};

type DataTableProps<T> = {
  columns: Column[];
  data: T[];
  /** Unique key for each row. */
  rowKey: (row: T) => string | number;
  /** Render one row's `<td>` cells (no wrapping `<tr>` needed — the component adds it). */
  renderRow: (row: T) => ReactNode;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Number of skeleton rows to show while loading (default 4). */
  skeletonRows?: number;
  /** Search value — pass the controlled value here. */
  search?: string;
  /** Called when the search input changes. If omitted, no search box is shown. */
  onSearchChange?: (value: string) => void;
  /** Placeholder for the search input (default "Search…"). */
  searchPlaceholder?: string;
  /** Empty-state config shown when `data` is empty. */
  empty: {
    icon: ReactNode;
    title: string;
    description: string;
  };
  /** Error-state copy. */
  errorState?: {
    title: string;
    description: string;
  };
};

/**
 * A reusable data table with built-in skeleton loading, error, and empty states.
 *
 * Each page provides column definitions, a row renderer producing `<td>` elements,
 * and the three-state lifecycle (loading / error / data).
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  renderRow,
  loading,
  error,
  onRetry,
  skeletonRows = 4,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  empty,
  errorState = { title: "Couldn't load data", description: "Check your connection and try again." },
}: DataTableProps<T>) {
  const colCount = columns.length;

  const thead = (
    <thead>
      <tr className="label-sm border-b border-border-subtle text-ink-secondary">
        {columns.map((col, i) => (
          <th
            key={col.header}
            className={`py-3 ${i < colCount - 1 ? "pr-4" : "pr-0"} ${col.headerClassName ?? ""}`}
          >
            {col.header}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <>
      {onSearchChange != null && (
        <div className="mb-5 sm:max-w-xs">
          <Input
            pill
            placeholder={searchPlaceholder}
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            {thead}
            <tbody>
              {Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-border-subtle last:border-0">
                  {columns.map((col, j) => (
                    <td key={col.header} className={`py-4 ${j < colCount - 1 ? "pr-4" : "pr-0"}`}>
                      {j === colCount - 1 ? (
                        <div className="flex justify-end gap-1.5">
                          <Skeleton className="h-9 w-9 rounded-md" />
                        </div>
                      ) : col.skeletonVariant === "badge" ? (
                        <Skeleton className={`h-6 ${col.skeletonWidth ?? "w-16"} rounded-full`} />
                      ) : (
                        <Skeleton className={`h-4 ${col.skeletonWidth ?? "w-16"}`} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <ErrorState title={errorState.title} description={errorState.description} onRetry={onRetry} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            {thead}
            <tbody>
              {data.map((row) => (
                <tr key={rowKey(row)} className="border-b border-border-subtle last:border-0">
                  {renderRow(row)}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-4">
                    <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
