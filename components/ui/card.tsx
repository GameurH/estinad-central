import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-bg-secondary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
