import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Button, IconButton } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number;
  /** Hide on small screens */
  hideOnMobile?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Number of skeleton rows while loading */
  skeletonRows?: number;
  initialSort?: { columnKey: string; direction: 'asc' | 'desc' };
  onSortChange?: (columnKey: string, direction: 'asc' | 'desc') => void;
  /** Row action shown on the right (non-navigational) */
  rowAction?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  loading,
  skeletonRows = 5,
  initialSort,
  onSortChange,
  rowAction,
}: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | undefined>(initialSort?.columnKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort?.direction ?? 'asc');

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    const newDir = sortCol === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    setSortCol(col.key);
    setSortDir(newDir);
    onSortChange?.(col.key, newDir);
  };

  const sortedRows = [...rows];
  if (sortCol) {
    const col = columns.find((c) => c.key === sortCol);
    if (col?.sortAccessor) {
      sortedRows.sort((a, b) => {
        const av = col.sortAccessor!(a);
        const bv = col.sortAccessor!(b);
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-left font-medium text-ink-secondary ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.width ?? ''}`}
                aria-sort={sortCol === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {col.sortable ? (
                  <button
                    onClick={() => handleSort(col)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {col.header}
                    <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
            {rowAction && <th scope="col" className="px-4 py-3 w-10" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`skeleton-${i}`}>
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3.5 ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>
                    <div className="cpf-skeleton h-4 w-full max-w-[120px]" />
                  </td>
                ))}
                {rowAction && <td />}
              </tr>
            ))
          ) : sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (rowAction ? 1 : 0)} className="px-4 py-12 text-center text-ink-secondary">
                No records to display
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-border last:border-0 hover:bg-surface-subtle transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 text-ink ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {rowAction && <td className="px-4 py-3.5 text-right">{rowAction(row)}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2 mt-4">
      <IconButton
        label="Previous page"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <span className="text-sm text-ink-secondary px-2">
        Page {page} of {totalPages}
      </span>
      <IconButton
        label="Next page"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        <ChevronRight className="h-4 w-4" />
      </IconButton>
    </nav>
  );
}

export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
}: {
  selectedCount: number;
  actions: Array<{ label: string; onClick: () => void; destructive?: boolean }>;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-brand/30 bg-brand/5 px-4 py-3 animate-slide-up">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-ink">{selectedCount} selected</span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.destructive ? 'danger' : 'secondary'}
            size="sm"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function TableToolbar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      {children}
    </div>
  );
}
