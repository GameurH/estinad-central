"use client";

import { useCallback, useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { MEDIA_MAX_BYTES, MEDIA_MIME_TYPES } from "@/lib/services";

/** `accept` attribute for media file inputs; mirrors the bucket allow-list. */
export const MEDIA_ACCEPT = MEDIA_MIME_TYPES.join(",");

export type MediaRejection = "unsupported" | "too_large";

/** Client-side mirror of the bucket limits, so rejects fail before uploading. */
export function rejectionOf(file: File): MediaRejection | null {
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) return "unsupported";
  if (file.size > MEDIA_MAX_BYTES) return "too_large";
  return null;
}

/** Splits a pick into uploadable files and rejects (the caller shows messages). */
export function partitionFiles(files: File[]): {
  accepted: File[];
  rejected: { file: File; reason: MediaRejection }[];
} {
  const accepted: File[] = [];
  const rejected: { file: File; reason: MediaRejection }[] = [];
  for (const file of files) {
    const reason = rejectionOf(file);
    if (reason) rejected.push({ file, reason });
    else accepted.push(file);
  }
  return { accepted, rejected };
}

/**
 * The one upload pipeline every media trigger goes through.
 *
 * A file picker, a drop zone and a picker dialog all end up here, so
 * validation, sequential upload with a running count, and per-file failure
 * reporting stay identical no matter how the files arrived. Callers expose
 * `uploading` on whatever they must lock while files are in flight.
 */
export function useMediaUpload(onUpload: (file: File) => Promise<void>): {
  uploadFiles: (files: File[] | FileList) => Promise<void>;
  uploading: boolean;
} {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(0);

  const uploadFiles = useCallback(
    async (files: File[] | FileList) => {
      const { accepted, rejected } = partitionFiles(Array.from(files));
      for (const { file, reason } of rejected) {
        const message = reason === "too_large" ? t("photo_too_large") : t("photo_unsupported");
        toast(`${file.name}: ${message}`, "error");
      }
      if (accepted.length === 0) return;

      setUploading(accepted.length);
      let failed = 0;
      for (const file of accepted) {
        try {
          await onUpload(file);
        } catch {
          failed += 1;
        } finally {
          setUploading((n) => n - 1);
        }
      }
      if (failed > 0) toast(`${failed} · ${t("photo_upload_failed")}`, "error");
    },
    [onUpload, t, toast],
  );

  return { uploadFiles, uploading: uploading > 0 };
}
