"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Package,
  FolderTree,
  FileBarChart,
  Settings,
  Search,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";

const ROUTES = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "overview accueil home" },
  { key: "orders", href: "/orders", icon: ShoppingCart, keywords: "commandes pos caisse orders" },
  { key: "online_orders", href: "/orders/online", icon: Globe, keywords: "web boutique en ligne online" },
  { key: "products", href: "/products", icon: Package, keywords: "produits catalogue menu items" },
  { key: "categories", href: "/categories", icon: FolderTree, keywords: "catégories families" },
  { key: "reports", href: "/reports", icon: FileBarChart, keywords: "rapports stats analytics" },
  { key: "settings", href: "/settings", icon: Settings, keywords: "paramètres réglages config" },
  { key: "business_settings", href: "/settings/business", icon: Settings, keywords: "établissement business branding" },
] as const;

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...ROUTES];
    return ROUTES.filter((r) =>
      `${t(r.key)} ${r.keywords} ${r.href}`.toLowerCase().includes(q),
    );
  }, [query, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open ]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[index]) {
        e.preventDefault();
        router.push(results[index].href);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, results, index, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[15vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-scale-in relative w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg-secondary shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("command_palette_hint")}
            aria-label={t("search")}
            className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="rounded border border-border bg-bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5" role="listbox">
          <p className="px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-wide text-text-muted uppercase">
            {t("go_to")}
          </p>
          {results.length === 0 && (
            <p className="px-2.5 py-4 text-center text-[13px] text-text-muted">
              {t("no_results")}
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={r.href}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => {
                router.push(r.href);
                onClose();
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-start text-[13px] transition-colors",
                i === index ? "bg-bg-surface text-text-primary" : "text-text-secondary",
              )}
            >
              <r.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 font-medium">{t(r.key)}</span>
              {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-text-muted" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
