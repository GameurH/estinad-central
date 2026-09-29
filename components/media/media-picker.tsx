"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import type { MediaItem } from "@/lib/domain";
import { MediaGrid } from "./media-grid";
import { MediaUploadButton } from "./media-upload-button";
import { useMediaUpload } from "./media-upload";
import type { MediaLibrary } from "./types";

/**
 * "Choose an image" dialog over a `MediaLibrary`.
 *
 * It knows nothing about products: the caller supplies the library (product
 * photos, the tenant library, anything) and optionally a filter bar. Single
 * mode picks one image and closes; `multiple` toggles a selection and hands it
 * back through `onConfirm` — which is how a product gallery attaches several
 * library images in one go.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  library,
  multiple = false,
  onConfirm,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  /** Single mode: called with the picked image. */
  onSelect?: (item: MediaItem) => void;
  library: MediaLibrary;
  multiple?: boolean;
  /** Multi mode: called with every selected image. */
  onConfirm?: (items: MediaItem[]) => void;
  /** Optional filter controls rendered above the grid. */
  filters?: ReactNode;
}) {
  const { t } = useLanguage();
  const { items, isLoading, error, onRefresh, onUpload } = library;
  const [selected, setSelected] = useState<MediaItem[]>([]);

  const { uploadFiles, uploading } = useMediaUpload(async (file) => {
    if (!onUpload) return;
    await onUpload(file);
    await onRefresh?.();
  });

  const toggle = (item: MediaItem) => {
    setSelected((current) =>
      current.some((s) => s.id === item.id)
        ? current.filter((s) => s.id !== item.id)
        : [...current, item],
    );
  };

  const close = () => {
    setSelected([]);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("media_picker_title")}
      description={t("media_picker_hint")}
      wide
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{filters}</div>
          {onUpload && (
            <MediaUploadButton
              label={t("media_upload")}
              loading={uploading}
              onFiles={uploadFiles}
            />
          )}
        </div>

        {error ? (
          <ErrorState
            title={t("error_title")}
            onRetry={() => void onRefresh?.()}
            retryLabel={t("retry")}
          />
        ) : isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : items.length === 0 ? (
          <p className="text-[13px] text-text-muted">{t("media_picker_empty")}</p>
        ) : (
          <MediaGrid
            items={items}
            selectedIds={multiple ? selected.map((s) => s.id) : undefined}
            onSelect={
              multiple
                ? toggle
                : (item) => {
                    onSelect?.(item);
                    close();
                  }
            }
          />
        )}

        {multiple && (
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <span className="me-auto text-xs text-text-muted">
              {selected.length} {t("media_selected")}
            </span>
            <Button size="sm" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={selected.length === 0}
              onClick={() => {
                onConfirm?.(selected);
                close();
              }}
            >
              {t("media_attach")}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
