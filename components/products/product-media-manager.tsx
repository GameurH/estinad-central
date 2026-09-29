"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";
import { MediaDropZone } from "@/components/media/media-drop-zone";
import { MediaGrid } from "@/components/media/media-grid";
import { MediaUploadButton } from "@/components/media/media-upload-button";
import { useMediaUpload } from "@/components/media/media-upload";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import type { ProductMedia } from "@/lib/domain";
import {
  deleteProductMedia,
  getProductMedia,
  reorderProductMedia,
  setPrimaryProductMedia,
  uploadProductMedia,
} from "@/lib/services";
import { cn } from "@/lib/utils";

function TileButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pressable grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Product gallery manager — `product_media` rows plus their `product-media`
 * Storage objects. The storefront reads this list first, so the primary photo
 * and the order set here are what customers see.
 *
 * Only the product-specific parts live here (primary/reorder/delete, the
 * product-scoped source); the grid, drop zone and upload pipeline come from
 * `components/media`.
 */
export function ProductMediaManager({
  tenantId,
  productId,
}: {
  tenantId: string;
  productId: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<ProductMedia[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProductMedia | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await getProductMedia(productId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [productId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { uploadFiles, uploading } = useMediaUpload(async (file) => {
    await uploadProductMedia({ tenantId, productId, file });
    // Re-read instead of appending: the server decides primary/position.
    await refresh();
  });

  const makePrimary = async (media: ProductMedia) => {
    if (media.isPrimary || busyId !== null) return;
    setBusyId(media.id);
    try {
      await setPrimaryProductMedia(productId, media.id);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    if (!items || busyId !== null) return;
    const target = index + delta;
    if (target < 1 || target >= items.length) return;
    const next = items.slice();
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
    setItems(next);
    setBusyId("reorder");
    try {
      await reorderProductMedia(productId, next.map((m) => m.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    const media = removing;
    if (!media) return;
    setRemoving(null);
    setBusyId(media.id);
    try {
      await deleteProductMedia(media);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const locked = uploading || busyId !== null;

  return (
    <Card>
      <CardHeader title={t("media")} subtitle={t("media_hint")} />
      <MediaDropZone
        className="space-y-3 p-4"
        disabled={locked}
        onFiles={(files) => void uploadFiles(files)}
      >
        {(dragging) => (
          <>
            <div className="flex justify-end">
              <MediaUploadButton
                label={t("photo_add")}
                loading={uploading}
                disabled={busyId !== null}
                onFiles={uploadFiles}
              />
            </div>

            {failed ? (
              <ErrorState
                title={t("error_title")}
                onRetry={() => void refresh()}
                retryLabel={t("retry")}
              />
            ) : items === null ? (
              <Skeleton className="h-32 w-full" />
            ) : items.length === 0 ? (
              <div
                className={cn(
                  "rounded-[var(--radius-sm)] border border-dashed px-4 py-8 text-center transition-colors",
                  dragging ? "border-accent bg-accent-muted/40" : "border-border",
                )}
              >
                <p className="text-[13px] font-medium text-text-primary">
                  {t("photo_empty")}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">{t("photo_drop")}</p>
              </div>
            ) : (
              <MediaGrid
                items={items}
                busyId={busyId}
                className={cn(
                  "rounded-[var(--radius-sm)] border border-transparent",
                  dragging && "border-accent",
                )}
                renderOverlay={(media) =>
                  media.isPrimary ? (
                    <Badge tone="accent" className="absolute top-2 start-2">
                      {t("photo_primary")}
                    </Badge>
                  ) : null
                }
                renderActions={(media, index) => (
                  <>
                    <TileButton
                      label={t("photo_set_primary")}
                      disabled={media.isPrimary || locked}
                      onClick={() => void makePrimary(media)}
                    >
                      <Star
                        className={cn(
                          "h-3.5 w-3.5",
                          media.isPrimary && "fill-current text-warning",
                        )}
                      />
                    </TileButton>
                    <span className="flex gap-0.5">
                      <TileButton
                        label={t("photo_move_earlier")}
                        disabled={index < 2 || locked}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                      </TileButton>
                      <TileButton
                        label={t("photo_move_later")}
                        disabled={index === 0 || index === items.length - 1 || locked}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                      </TileButton>
                      <TileButton
                        label={t("photo_remove")}
                        disabled={locked}
                        onClick={() => setRemoving(media)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </TileButton>
                    </span>
                  </>
                )}
              />
            )}
          </>
        )}
      </MediaDropZone>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={t("photo_remove")}
        body={t("photo_remove_confirm")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
      />
    </Card>
  );
}
