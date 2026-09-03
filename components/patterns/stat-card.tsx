import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  deltaSuffix = "",
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  icon: LucideIcon;
  hint?: string;
}) {
  const positive = (delta ?? 0) > 0;
  const negative = (delta ?? 0) < 0;
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-text-secondary">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-text-muted" />
      </div>
      <p className="tnum mt-2 truncate text-2xl font-semibold tracking-tight text-text-primary">
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              positive && "text-success",
              negative && "text-danger",
              !positive && !negative && "text-text-muted",
            )}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : negative ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaSuffix}
          </span>
        )}
        {hint && <span className="truncate text-text-muted">{hint}</span>}
      </div>
    </div>
  );
}
