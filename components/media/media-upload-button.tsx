"use client";

import { useRef, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEDIA_ACCEPT } from "./media-upload";

/**
 * File-picking trigger only — it hands the selected files to `onFiles` and
 * shows the busy state the caller passes in. All the work (validation,
 * uploading, error reporting) lives in `useMediaUpload`, so a drop zone beside
 * this button runs the exact same pipeline.
 */
export function MediaUploadButton({
  onFiles,
  loading = false,
  disabled = false,
  label,
  icon,
  variant,
  className,
}: {
  onFiles: (files: File[]) => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  label: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        className={className}
        icon={icon ?? <ImagePlus className="h-4 w-4" />}
        loading={loading}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (files.length > 0) void onFiles(files);
        }}
      />
    </>
  );
}
