import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  empty,
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  /** Renders a leading checkbox column. */
  selectable?: boolean;
  /** Required when `selectable`. Ids of the currently selected rows. */
  selectedIds?: ReadonlySet<string>;
  /** Required when `selectable`. Called with the row id on checkbox click. */
  onToggleRow?: (id: string) => void;
  /** Required when `selectable`. Header checkbox — select / clear every row. */
  onToggleAll?: () => void;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const keyOf = (row: T, index: number) => {
    if (getRowId) return getRowId(row, index);
    const maybe = row as { id?: unknown };
    return typeof maybe.id === "string" ? maybe.id : `row-${index}`;
  };

  const allSelected = selectable
    ? rows.length > 0 && rows.every((r, i) => selectedIds?.has(keyOf(r, i)) ?? false)
    : false;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-bg-inset">
            {selectable && (
              <th scope="col" className="w-9 px-3 align-middle">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all"
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "h-9 px-4 align-middle text-xs font-medium whitespace-nowrap text-text-secondary",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row, index) => (
            <tr
              key={keyOf(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors hover:bg-bg-surface/60",
                onRowClick && "cursor-pointer",
                selectable && selectedIds?.has(keyOf(row, index)) && "bg-accent-muted",
              )}
            >
              {selectable && (
                <td className="px-3 py-3 align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(keyOf(row, index)) ?? false}
                    onChange={() => onToggleRow?.(keyOf(row, index))}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    aria-label={`Select row ${index + 1}`}
                  />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RowPrimary({ children }: { children: ReactNode }) {
  return <span className="font-medium text-text-primary">{children}</span>;
}

export function RowSecondary({ children }: { children: ReactNode }) {
  return <span className="text-text-secondary">{children}</span>;
}
