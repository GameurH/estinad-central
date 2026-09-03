"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { current, isLoading } = useTenant();
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onPaletteOpen={() => setPaletteOpen(true)}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-4 sm:py-6">
          {!isLoading && !current ? (
            <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-border bg-bg-secondary px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-warning-muted">
                <ShieldAlert className="h-7 w-7 text-warning" />
              </div>
              <h1 className="mt-4 text-base font-semibold text-text-primary">
                {t("no_access_title")}
              </h1>
              <p className="mt-1 max-w-sm text-[13px] text-text-secondary">
                {t("no_access_body")}
              </p>
              <Link href="/login" className="mt-5">
                <Button size="sm">{t("back_to_login")}</Button>
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
