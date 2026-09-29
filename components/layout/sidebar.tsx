"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Globe,
  Package,
  FolderTree,
  Images,
  FileBarChart,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Monogram } from "@/components/monogram";
import { useLanguage } from "@/components/providers/language-provider";

const ITEMS = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "orders", href: "/orders", icon: ShoppingCart },
  { key: "online_orders", href: "/orders/online", icon: Globe },
  { key: "products", href: "/products", icon: Package },
  { key: "categories", href: "/categories", icon: FolderTree },
  { key: "media_library", href: "/media", icon: Images },
  { key: "reports", href: "/reports", icon: FileBarChart },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  // "/orders" and "/orders/online" are sibling entries — exact match only.
  if (href === "/orders" || href === "/orders/online") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  mobileOpen,
  onNavigate,
}: {
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onNavigate}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "z-50 flex w-60 shrink-0 flex-col border-e border-border bg-bg-secondary transition-transform duration-200",
          "fixed inset-y-0 start-0 lg:sticky lg:top-0 lg:h-screen",
          mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
          "lg:translate-x-0",
        )}
        aria-label="Navigation principale"
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/dashboard" className="flex items-center gap-3" aria-label="ESTINAD Central home">
            <Monogram className="h-6 w-6" />
            <span className="block leading-tight">
              <span className="block font-mono text-xs font-semibold tracking-[0.3em] text-text-primary">
                ESTINAD
              </span>
              <span className="mt-0.5 block text-[10px] font-medium tracking-[0.18em] text-text-muted uppercase">
                Central
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-bg-surface text-text-primary"
                    : "text-text-secondary hover:bg-bg-surface/60 hover:text-text-primary",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-accent"
                  />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Link
            href="/login"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-surface/60 hover:text-text-primary"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {t("logout")}
          </Link>
        </div>
      </aside>
    </>
  );
}
