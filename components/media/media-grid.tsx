"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { MediaItem } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TILE_SIZES = "(min-width: 1280px) 180px, (min-width: 640px) 28vw, 44vw";

/**
 * Presentational image grid — no data access at all.
 *
 * The gallery and the picker both render through this: the gallery injects its
 * primary badge and its per-tile actions, the picker just makes tiles
 * selectable. The action row is rendered beside the select button rather than
 * inside it, so action buttons never nest inside a button.
 *
 * Generic over the item type so callers keep their richer type (the gallery
 * gets `ProductMedia` back, with `isPrimary`/`position` intact).
 */
export function MediaGrid<T extends MediaItem>({
  items,
  onSelect,
  selectedIds,
  busyId,
  renderOverlay,
  renderActions,
  className,
}: {
  items: T[];
  onSelect?: (item: T) => void;
  /** Ids rendered as selected (multi-select pickers). */
  selectedIds?: string[];
  /** Id of the tile showing a busy overlay (an in-flight mutation). */
  busyId?: string | null;
  /** Rendered inside the image well, e.g. a "primary" badge. */
  renderOverlay?: (item: T, index: number) => ReactNode;
  /** Rendered in a footer row under the image. */
  renderActions?: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4", className)}>
      {items.map((item, index) => {
        const well = (
          <div className="relative aspect-square bg-bg-inset">
            <Image
              src={item.url}
              alt={item.alt ?? ""}
              fill
              sizes={TILE_SIZES}
              className="object-cover"
            />
            {renderOverlay?.(item, index)}
            {busyId === item.id && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <span
                  aria-hidden
                  className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
              </span>
            )}
          </div>
        );

        return (
          <li
            key={item.id}
            className={cn(
              "overflow-hidden rounded-[var(--radius-sm)] border bg-bg-secondary",
              selectedIds?.includes(item.id) ? "border-accent" : "border-border",
            )}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="pressable block w-full cursor-pointer text-start"
              >
                {well}
              </button>
            ) : (
              well
            )}
            {renderActions && (
              <div className="flex items-center justify-between gap-0.5 border-t border-border px-1.5 py-1">
                {renderActions(item, index)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
