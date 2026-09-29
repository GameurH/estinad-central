"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Droppable area for the media components.
 *
 * It only owns the drag affordance (enter/leave state and `preventDefault`);
 * the files go straight to the caller, which runs them through the same
 * validation as the upload button. `children` may be a render prop so the inner
 * layout can react to the drag state.
 */
export function MediaDropZone({
  onFiles,
  disabled = false,
  className,
  draggingClassName,
  children,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  className?: string;
  draggingClassName?: string;
  children: ReactNode | ((dragging: boolean) => ReactNode);
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cn(className, dragging && draggingClassName)}
    >
      {typeof children === "function" ? children(dragging) : children}
    </div>
  );
}
