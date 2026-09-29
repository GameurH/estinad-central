"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Star,
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import type { ProductMedia } from "@/lib/domain";
import {
  deleteProductMedia,
  getProductMedia,
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  reorderProductMedia,
  setPrimaryProductMedia,
  uploadProductMedia,
} from "@/lib/services";
import { cn } from "@/lib/utils";

const ACCEPT = MEDIA_MIME_TYPES.join(",");

function rejectionOf(file: File): "unsupported" | "too_large" | null {
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) return "unsupported";
  if (file.size > MEDIA_MAX_BYTES) return "too_large";
  return null;
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ProductMedia[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
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

  const addFiles = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;

    const accepted: File[] = [];
    for (const file of list) {
      const rejection = rejectionOf(file);
      if (rejection === "unsupported") {
        toast(`${file.name}: ${t("photo_unsupported")}`, "error");
        continue;
      }
      if (rejection === "too_large") {
        toast(`${file.name}: ${t("photo_too_large")}`, "error");
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    setUploading(accepted.length);
    let failedCount = 0;
    for (const file of accepted) {
      try {
        await uploadProductMedia({ tenantId, productId, file });
      } catch {
        failedCount += 1;
      } finally {
        setUploading((n) => n - 1);
      }
    }
    // Re-read instead of appending: the server decides primary/position.
    await refresh();
    if (failedCount > 0) {
      toast(`${failedCount} · ${t("photo_upload_failed")}`, "error");
    }
  };

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

  const uploadingNow = uploading > 0;
  const locked = uploadingNow || busyId !== null;

  return (
    <Card>
      <CardHeader title={t("media")} subtitle={t("media_hint")} />
      <div
        className="space-y-3 p-4"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!locked) void addFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<ImagePlus className="h-4 w-4" />}
            loading={uploadingNow}
            onClick={() => inputRef.current?.click()}
          >
            {t("photo_add")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
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
          <ul
            className={cn(
              "grid grid-cols-2 gap-3 rounded-[var(--radius-sm)] border border-transparent sm:grid-cols-3 xl:grid-cols-4",
              dragging && "border-accent",
            )}
          >
            {items.map((media, index) => (
              <li
                key={media.id}
                className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-secondary"
              >
                <div className="relative aspect-square bg-bg-inset">
                  <Image
                    src={media.url}
                    alt={media.altText ?? ""}
                    fill
                    sizes="(min-width: 1280px) 180px, (min-width: 640px) 28vw, 44vw"
                    className="object-cover"
                  />
                  {media.isPrimary && (
                    <Badge tone="accent" className="absolute top-2 start-2">
                      {t("photo_primary")}
                    </Badge>
                  )}
                  {busyId === media.id && (
                    <span className="absolute inset-0 grid place-items-center bg-black/40">
                      <span
                        aria-hidden
                        className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                      />
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-0.5 border-t border-border px-1.5 py-1">
                  <TileButton
                    label={t("photo_set_primary")}
                    disabled={media.isPrimary || locked}
                    onClick={() => void makePrimary(media)}
                  >
                    <Star
                      className={cn("h-3.5 w-3.5", media.isPrimary && "fill-current text-warning")}
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

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
