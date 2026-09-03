"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Inbox,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./button";

function Shell({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-bg-surface">
        <Icon className="h-7 w-7 text-text-muted" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-text-secondary">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return <Shell icon={Inbox} {...props} />;
}

export function NoResultsState({
  title,
  hint,
  onClear,
  clearLabel,
}: {
  title: string;
  hint?: string;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <Shell
      icon={SearchX}
      title={title}
      hint={hint}
      action={
        <Button onClick={onClear} size="sm">
          {clearLabel}
        </Button>
      }
    />
  );
}

export function ErrorState({
  title,
  onRetry,
  retryLabel,
}: {
  title: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-danger-muted">
        <AlertTriangle className="h-7 w-7 text-danger" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-5">
        <Button onClick={onRetry} size="sm">
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
