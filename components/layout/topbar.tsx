"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Menu, Moon, Sun, Monitor, Languages, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/components/providers/tenant-provider";
import {
  LANGUAGES,
  useLanguage,
} from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { TenantStatusBadge } from "@/components/patterns/status";
import { trialDaysLeft } from "@/lib/services";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function TenantSwitcher() {
  const { tenants, current, select, isLoading } = useTenant();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  if (isLoading || !current) {
    return <div className="h-9 w-52 animate-pulse rounded-[var(--radius-sm)] bg-bg-surface" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-transparent px-2.5 transition-colors hover:border-border hover:bg-bg-surface/60"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-bg-surface text-xs font-semibold text-text-primary">
          {current.name.charAt(0)}
        </span>
        <span className="max-w-40 truncate text-[13px] font-medium text-text-primary">
          {current.name}
        </span>
        <TenantStatusBadge status={current.status} />
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-scale-in absolute start-0 top-full z-50 mt-1.5 w-72 rounded-[var(--radius-md)] border border-border bg-bg-secondary p-1.5 shadow-xl"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-text-muted uppercase">
            {t("stores")}
          </p>
          {tenants.map((t) => {
            const active = t.id === current.id;
            const days = trialDaysLeft(t);
            return (
              <button
                key={t.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  select(t.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-start transition-colors",
                  active ? "bg-bg-surface" : "hover:bg-bg-surface/60",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-bg-inset text-xs font-semibold text-text-primary">
                  {t.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">
                    {t.name}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {days !== null ? `${days} j d'essai` : t.businessAddress ?? ""}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LanguageMenu() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const current = LANGUAGES.find((l) => l.code === lang);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("language")}
        title={t("language")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
      >
        <Languages className="h-4 w-4" />
      </button>
      {open && (
        <div className="animate-scale-in absolute end-0 top-full z-50 mt-1.5 w-44 rounded-[var(--radius-md)] border border-border bg-bg-secondary p-1.5 shadow-xl">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] transition-colors",
                l.code === lang
                  ? "bg-bg-surface text-text-primary"
                  : "text-text-secondary hover:bg-bg-surface/60 hover:text-text-primary",
              )}
            >
              {l.nativeName}
              {l.code === lang && <Check className="h-3.5 w-3.5 text-accent" />}
              <span className="sr-only">{current?.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  const options = [
    { value: "light" as const, label: t("light"), icon: Sun },
    { value: "dark" as const, label: t("dark"), icon: Moon },
    { value: "system" as const, label: t("system"), icon: Monitor },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("theme")}
        title={t("theme")}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <div className="animate-scale-in absolute end-0 top-full z-50 mt-1.5 w-40 rounded-[var(--radius-md)] border border-border bg-bg-secondary p-1.5 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                setTheme(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] transition-colors",
                theme === o.value
                  ? "bg-bg-surface text-text-primary"
                  : "text-text-secondary hover:bg-bg-surface/60 hover:text-text-primary",
              )}
            >
              <o.icon className="h-3.5 w-3.5" />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Topbar({
  onMenuClick,
  onPaletteOpen,
}: {
  onMenuClick: () => void;
  onPaletteOpen: () => void;
}) {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPaletteOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPaletteOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg-primary/90 px-3 backdrop-blur sm:px-4">
      <button
        onClick={onMenuClick}
        aria-label="Menu"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] text-text-secondary hover:bg-bg-surface hover:text-text-primary lg:hidden"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      <TenantSwitcher />

      <div className="flex-1" />

      <button
        onClick={onPaletteOpen}
        className="hidden h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-secondary px-3 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text-secondary md:flex md:w-56"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-start">{t("search")}</span>
        <kbd className="rounded border border-border bg-bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
          ⌘K
        </kbd>
      </button>

      <LanguageMenu />
      <ThemeMenu />

      <button
        onClick={() => router.push("/settings")}
        aria-label={t("settings")}
        className="hidden h-9 cursor-pointer items-center rounded-[var(--radius-sm)] px-2.5 text-[13px] text-text-secondary hover:bg-bg-surface hover:text-text-primary sm:flex"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-muted text-[11px] font-semibold text-accent">
          A
        </span>
      </button>
    </header>
  );
}
