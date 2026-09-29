"use client";

import { useLanguage } from "@/components/providers/language-provider";
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
 * It knows nothing about products: the caller supplies the library, so the
 * markdown editor picks from the product's photos while a category tile picks
 * from the tenant's uploads — same dialog, same grid.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  library,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
  library: MediaLibrary;
}) {
  const { t } = useLanguage();
  const { items, isLoading, error, onRefresh, onUpload } = library;
  const { uploadFiles, uploading } = useMediaUpload(async (file) => {
    if (!onUpload) return;
    await onUpload(file);
    await onRefresh?.();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("media_picker_title")}
      description={t("media_picker_hint")}
      wide
    >
      <div className="space-y-3">
        {onUpload && (
          <div className="flex justify-end">
            <MediaUploadButton
              label={t("media_upload")}
              loading={uploading}
              onFiles={uploadFiles}
            />
          </div>
        )}

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
          <MediaGrid items={items} onSelect={onSelect} />
        )}
      </div>
    </Dialog>
  );
}
