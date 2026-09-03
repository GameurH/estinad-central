"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Globe, MapPin, Phone } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { TenantStatusBadge } from "@/components/patterns/status";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LANGUAGES } from "@/components/providers/language-provider";
import { getLanguages, trialDaysLeft } from "@/lib/services";
import { formatCurrency } from "@/lib/format";
import type { Language } from "@/lib/domain";

export default function SettingsPage() {
  const { current, isLoading } = useTenant();
  const { t } = useLanguage();
  const [contentLangs, setContentLangs] = useState<Language[]>([]);

  useEffect(() => {
    getLanguages()
      .then(setContentLangs)
      .catch(() => setContentLangs([]));
  }, []);

  if (isLoading || !current) {
    return (
      <div className="animate-fade-in space-y-4">
        <PageHeader title={t("settings")} />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const days = trialDaysLeft(current);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("settings")}
        actions={
          <Link href="/settings/business">
            <Button variant="primary" size="sm">
              {t("business_settings")}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader
          title={current.name}
          subtitle={current.businessType ?? undefined}
          action={<TenantStatusBadge status={current.status} />}
        />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <dt className="text-xs text-text-muted">{t("business")}</dt>
              <dd className="font-medium text-text-primary">{current.businessName ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <dt className="text-xs text-text-muted">{t("address")}</dt>
              <dd className="font-medium text-text-primary">{current.businessAddress ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <dt className="text-xs text-text-muted">{t("phone")}</dt>
              <dd className="tnum font-medium text-text-primary">{current.ownerPhone ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
            <div>
              <dt className="text-xs text-text-muted">{t("storefront")}</dt>
              <dd className="font-medium text-text-primary">
                {current.storefrontEnabled ? (
                  <span className="font-mono text-[13px]">
                    {current.storefrontSlug}.store.sahara.dz
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </div>
        </dl>
        {days !== null && (
          <p className="border-t border-border px-4 py-3 text-[13px] text-text-secondary">
            {days} {t("trial_days_left")} · {t("owner")}: {current.ownerEmail}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("language")}
          subtitle="Contenu trilingue FR / AR / EN — repli FR"
        />
        <ul className="divide-y divide-[var(--border)]">
          {(contentLangs.length > 0
            ? contentLangs
            : ([
                { code: "fr", name: "Français", nativeName: "Français", isDefault: true, isRtl: false, isActive: true },
                { code: "ar", name: "Arabic", nativeName: "العربية", isDefault: false, isRtl: true, isActive: true },
                { code: "en", name: "English", nativeName: "English", isDefault: false, isRtl: false, isActive: true },
              ] as Language[])
          ).map((l) => (
            <li key={l.code} className="flex items-center gap-3 px-4 py-3 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-text-primary">{l.name}</span>
                <span className="block text-xs text-text-muted">
                  {LANGUAGES.find((x) => x.code === l.code)?.nativeName ?? l.nativeName}
                </span>
              </span>
              {l.isDefault && (
                <span className="rounded bg-accent-muted px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  défaut
                </span>
              )}
              {l.isActive && (
                <span className="rounded bg-success-muted px-1.5 py-0.5 text-[11px] font-medium text-success">
                  active
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title={t("ordering")} />
        <dl className="grid grid-cols-2 gap-3 p-4 text-[13px] sm:grid-cols-4">
          {(
            [
              [t("delivery"), current.deliveryEnabled],
              ["Pickup", current.pickupEnabled],
              ["Sur place", current.dineInEnabled],
              ["Réservations", current.reservationsEnabled],
            ] as [string, boolean][]
          ).map(([label, on]) => (
            <div
              key={label}
              className="rounded-[var(--radius-sm)] border border-border px-3 py-2.5"
            >
              <p className="text-xs text-text-muted">{label}</p>
              <p className={`mt-0.5 font-medium ${on ? "text-success" : "text-text-muted"}`}>
                {on ? t("available") : t("unavailable")}
              </p>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-border px-4 py-3 text-[13px]">
          <span className="text-text-secondary">
            Min. <strong className="tnum text-text-primary">{formatCurrency(current.minOrderAmount)}</strong>
          </span>
          <span className="text-text-secondary">
            Préparation <strong className="tnum text-text-primary">{current.estimatedPrepTime} min</strong>
          </span>
        </div>
      </Card>
    </div>
  );
}
