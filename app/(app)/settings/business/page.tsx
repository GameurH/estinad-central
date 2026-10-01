"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Switch, Textarea } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { updateTenantSettings } from "@/lib/services";
import type { ContactInfo, DayHours } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Tab = "general" | "ordering" | "storefront" | "branding" | "location" | "contact";
interface BusinessDraft {
  name: string;
  businessName: string;
  businessAddress: string;
  ownerPhone: string;
  onlineOrdering: boolean;
  delivery: boolean;
  pickup: boolean;
  dineIn: boolean;
  reservations: boolean;
  autoAccept: boolean;
  minOrder: number;
  prepTime: number;
  storefrontEnabled: boolean;
  storefrontSlug: string;
  storefrontDescription: string;
  tagline: string;
  siteTitle: string;
  metaDescription: string;
  latitude: string;
  longitude: string;
  /** Storefront-facing contact — mirrors `ContactInfo` in lib/domain.ts. */
  contact: ContactInfo;
  /** Weekly hours, index 0 = Sunday. */
  operatingHours: DayHours[];
}

const DEFAULT_HOURS: DayHours[] = Array.from({ length: 7 }, () => ({
  open: "09:00",
  close: "18:00",
  closed: true,
}));

type BooleanKeys = {
  [K in keyof BusinessDraft]: BusinessDraft[K] extends boolean ? K : never;
}[keyof BusinessDraft];

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export default function BusinessSettingsPage() {
  const router = useRouter();
  const { current } = useTenant();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("general");
  const [draft, setDraft] = useState<BusinessDraft | null>(null);
  const [initial, setInitial] = useState<BusinessDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current || draft) return;
    const d: BusinessDraft = {
      name: current.name,
      businessName: current.businessName ?? "",
      businessAddress: current.businessAddress ?? "",
      ownerPhone: current.ownerPhone ?? "",
      onlineOrdering: current.onlineOrderingEnabled,
      delivery: current.deliveryEnabled,
      pickup: current.pickupEnabled,
      dineIn: current.dineInEnabled,
      reservations: current.reservationsEnabled,
      autoAccept: current.autoAcceptOrders,
      minOrder: current.minOrderAmount,
      prepTime: current.estimatedPrepTime,
      storefrontEnabled: current.storefrontEnabled,
      storefrontSlug: current.storefrontSlug ?? "",
      storefrontDescription: current.storefrontDescription ?? "",
      tagline: current.brand.tagline.fr,
      siteTitle: current.brand.siteTitle.fr,
      metaDescription: current.brand.metaDescription.fr,
      latitude: current.latitude?.toString() ?? "",
      longitude: current.longitude?.toString() ?? "",
      contact: current.contact ?? {
        email: "",
        phone: "",
        whatsapp: "",
        website: "",
        address: "",
        instagram: "",
        facebook: "",
        tiktok: "",
      },
      operatingHours: Array.from({ length: 7 }, (_, i) =>
        current.operatingHours?.[String(i)] ?? DEFAULT_HOURS[i],
      ),
    };
    setDraft(d);
    setInitial(d);
  }, [current, draft]);

  const dirty = useMemo(
    () => draft !== null && initial !== null && JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );

  if (!draft) {
    return (
      <div className="animate-fade-in space-y-4">
        <PageHeader title={t("business_settings")} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const set = <K extends keyof BusinessDraft>(key: K, value: BusinessDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await updateTenantSettings(current.id, draft);
      setInitial(draft);
      toast(t("saved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: t("general") },
    { id: "ordering", label: t("ordering") },
    { id: "storefront", label: t("storefront") },
    { id: "branding", label: t("branding") },
    { id: "location", label: t("location") },
    { id: "contact", label: t("contact_tab") },
  ];

  const bool = <K extends BooleanKeys>(key: K) => ({
    checked: draft[key],
    onChange: (v: boolean) => set(key, v),
  });

  return (
    <div className="animate-fade-in space-y-4 pb-24">
      <PageHeader
        title={t("business_settings")}
        subtitle={current?.name}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="h-4 w-4 rtl:rotate-180" />}
            onClick={() => router.push("/settings")}
          >
            {t("back")}
          </Button>
        }
      />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              "relative shrink-0 cursor-pointer px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              tab === tb.id ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tb.label}
            {tab === tb.id && (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <Card className="animate-fade-in">
          <CardHeader title={t("general")} />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label={t("store_name")}>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label={t("business")}>
              <Input value={draft.businessName} onChange={(e) => set("businessName", e.target.value)} />
            </Field>
            <Field label={t("address")} className="sm:col-span-2">
              <Input value={draft.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} />
            </Field>
            <Field label={t("phone")}>
              <Input value={draft.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} inputMode="tel" />
            </Field>
          </div>
        </Card>
      )}

      {tab === "ordering" && (
        <Card className="animate-fade-in">
          <CardHeader title={t("ordering")} />
          <div className="divide-y divide-[var(--border)] px-4">
            <ToggleRow label="Commande en ligne" {...bool("onlineOrdering")} />
            <ToggleRow label={t("delivery")} {...bool("delivery")} />
            <ToggleRow label="Retrait (pickup)" {...bool("pickup")} />
            <ToggleRow label="Sur place" {...bool("dineIn")} />
            <ToggleRow label="Réservations" {...bool("reservations")} />
            <ToggleRow label="Acceptation auto" hint="Sans validation manuelle" {...bool("autoAccept")} />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-border p-4">
            <Field label="Minimum (DA)">
              <Input type="number" min={0} value={draft.minOrder} onChange={(e) => set("minOrder", Number(e.target.value))} />
            </Field>
            <Field label="Préparation (min)">
              <Input type="number" min={0} value={draft.prepTime} onChange={(e) => set("prepTime", Number(e.target.value))} />
            </Field>
          </div>
        </Card>
      )}

      {tab === "storefront" && (
        <Card className="animate-fade-in">
          <CardHeader title={t("storefront")} />
          <div className="space-y-4 p-4">
            <ToggleRow label="Boutique activée" {...bool("storefrontEnabled")} />
            <Field label="Slug" hint=".store.sahara.dz">
              <Input value={draft.storefrontSlug} onChange={(e) => set("storefrontSlug", e.target.value)} className="font-mono" />
            </Field>
            <Field label={t("description")}>
              <Textarea value={draft.storefrontDescription} onChange={(e) => set("storefrontDescription", e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {tab === "branding" && (
        <Card className="animate-fade-in">
          <CardHeader title={t("branding")} subtitle="FR — AR / EN suivent dans Core" />
          <div className="space-y-4 p-4">
            <Field label="Slogan">
              <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
            </Field>
            <Field label="Titre du site">
              <Input value={draft.siteTitle} onChange={(e) => set("siteTitle", e.target.value)} />
            </Field>
            <Field label="Meta description">
              <Textarea value={draft.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} />
            </Field>
          </div>
        </Card>
      )}

      {tab === "location" && (
        <Card className="animate-fade-in">
          <CardHeader title={t("location")} />
          <div className="grid grid-cols-2 gap-4 p-4">
            <Field label="Latitude">
              <Input value={draft.latitude} onChange={(e) => set("latitude", e.target.value)} inputMode="decimal" className="font-mono" />
            </Field>
            <Field label="Longitude">
              <Input value={draft.longitude} onChange={(e) => set("longitude", e.target.value)} inputMode="decimal" className="font-mono" />
            </Field>
          </div>
        </Card>
      )}

      {tab === "contact" && (
        <>
          <Card className="animate-fade-in">
            <CardHeader title={t("contact_tab")} subtitle={t("contact_public_hint")} />
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              <Field label={t("public_email")}>
                <Input type="email" value={draft.contact.email} onChange={(e) => set("contact", { ...draft.contact, email: e.target.value })} inputMode="email" />
              </Field>
              <Field label={t("public_phone")}>
                <Input value={draft.contact.phone} onChange={(e) => set("contact", { ...draft.contact, phone: e.target.value })} inputMode="tel" />
              </Field>
              <Field label={t("whatsapp")} hint={t("whatsapp_hint")}>
                <Input value={draft.contact.whatsapp} onChange={(e) => set("contact", { ...draft.contact, whatsapp: e.target.value })} inputMode="tel" />
              </Field>
              <Field label={t("website")}>
                <Input value={draft.contact.website} onChange={(e) => set("contact", { ...draft.contact, website: e.target.value })} inputMode="url" className="font-mono" />
              </Field>
              <Field label={t("public_address")} className="sm:col-span-2" hint={t("contact_address_hint")}>
                <Input value={draft.contact.address} onChange={(e) => set("contact", { ...draft.contact, address: e.target.value })} />
              </Field>
              <Field label={t("instagram")}>
                <Input value={draft.contact.instagram} onChange={(e) => set("contact", { ...draft.contact, instagram: e.target.value })} className="font-mono" />
              </Field>
              <Field label={t("facebook")}>
                <Input value={draft.contact.facebook} onChange={(e) => set("contact", { ...draft.contact, facebook: e.target.value })} className="font-mono" />
              </Field>
              <Field label={t("tiktok")}>
                <Input value={draft.contact.tiktok} onChange={(e) => set("contact", { ...draft.contact, tiktok: e.target.value })} className="font-mono" />
              </Field>
            </div>
          </Card>
          <Card className="animate-fade-in">
            <CardHeader title={t("business_hours")} subtitle={t("business_hours_hint")} />
            <div className="divide-y divide-[var(--border)] px-4">
              {draft.operatingHours.map((h, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-3">
                  <p className="text-[13px] font-medium text-text-primary">{t(`day_${i}`)}</p>
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={(e) =>
                        set("operatingHours", draft.operatingHours.map((x, j) =>
                          j === i ? { ...x, closed: e.target.checked } : x,
                        ))
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {t("hours_closed")}
                  </label>
                  <Input
                    type="time"
                    value={h.open}
                    disabled={h.closed}
                    onChange={(e) =>
                      set("operatingHours", draft.operatingHours.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))
                    }
                    className="w-28"
                  />
                  <Input
                    type="time"
                    value={h.close}
                    disabled={h.closed}
                    onChange={(e) =>
                      set("operatingHours", draft.operatingHours.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))
                    }
                    className="w-28"
                  />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {dirty && (
        <div className="animate-slide-down fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-3">
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-bg-secondary py-2.5 ps-4 pe-2.5 shadow-xl">
            <p className="truncate text-[13px] font-medium text-text-primary">
              {t("unsaved_changes")}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => setDraft(initial)}>
                {t("discard")}
              </Button>
              <Button size="sm" variant="primary" loading={saving} onClick={save}>
                {t("save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
