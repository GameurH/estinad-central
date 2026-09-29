"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { MediaPicker } from "./media-picker";
import { MediaUploadButton } from "./media-upload-button";
import { useMediaUpload } from "./media-upload";
import type { MediaLibrary } from "./types";

/**
 * Single-image field: preview + choose + upload + paste-a-URL + clear.
 *
 * Built on the same picker and upload button as the gallery, so a context that
 * only needs one image (a category tile) gets the whole media workflow without
 * a table of its own.
 *
 * The preview uses a plain `<img>`: the URL can be pasted by hand and therefore
 * point at any host, and `next/image` throws for a host that is not listed in
 * `images.remotePatterns`.
 */
export function MediaField({
  label,
  value,
  onChange,
  loadLibrary,
  onUpload,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Lazy library for the picker; omit to offer upload/URL only. */
  loadLibrary?: () => Promise<MediaLibrary>;
  /** Uploads one file and resolves to its public URL. */
  onUpload: (file: File) => Promise<string>;
}) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<MediaLibrary | null>(null);
  const { uploadFiles, uploading } = useMediaUpload(async (file) =>
    onChange(await onUpload(file)),
  );

  const openPicker = () => {
    setPickerOpen(true);
    if (!loadLibrary) {
      setLibrary({ items: [] });
      return;
    }
    setLibrary({ items: [], isLoading: true });
    loadLibrary()
      .then(setLibrary)
      .catch(() => setLibrary({ items: [], error: true }));
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-inset">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- merchant-supplied URL
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[11px] text-text-muted">
              —
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {loadLibrary && (
              <Button size="sm" onClick={openPicker}>
                {t("media_picker_title")}
              </Button>
            )}
            <MediaUploadButton
              label={t("media_upload")}
              loading={uploading}
              variant={loadLibrary ? "ghost" : undefined}
              onFiles={uploadFiles}
            />
            {value && (
              <Button
                size="sm"
                variant="ghost"
                icon={<X className="h-4 w-4" />}
                onClick={() => onChange("")}
              >
                {t("photo_remove")}
              </Button>
            )}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            aria-label={t("media_url")}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        library={library ?? { items: [], isLoading: true }}
        onSelect={(item) => {
          onChange(item.url);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
