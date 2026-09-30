"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { MediaField } from "@/components/media/media-field";
import { PageHeader } from "@/components/patterns/page-header";
import { useLanguage, LANGUAGES } from "@/components/providers/language-provider";
import { useTenant } from "@/components/providers/tenant-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import type { HeroSection } from "@/lib/domain";
import { getHeroSection, getMediaAssets, saveHeroSection, uploadMediaAsset } from "@/lib/services";

/**
 * Edits the storefront homepage hero as a `homepage_section_content` row
 * (section_id = 'hero'). An empty form means "use the storefront defaults":
 * saving stores an override, deleting nothing — the storefront renders its
 * built-in hero whenever no row exists.
 */
export default function HeroEditorPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [section, setSection] = useState<HeroSection | null>(null);
  const [lang, setLang] = useState<"fr" | "ar" | "en">("fr");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!current) return;
    setLoading(true);
    setFailed(false);
    getHeroSection(current.id)
      .then((s) =>
        setSection(
          s ?? {
            tenantId: current.id,
            fr: { titleLead: "", titleTail: "", support: "", primaryCta: "", secondaryCta: "" },
            ar: { titleLead: "", titleTail: "", support: "", primaryCta: "", secondaryCta: "" },
            en: { titleLead: "", titleTail: "", support: "", primaryCta: "", secondaryCta: "" },
            images: { desktop: "", mobile: "", alt: { fr: "", ar: "", en: "" } },
            updatedAt: null,
          },
        ),
      )
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [current]);

  const update = (code: "fr" | "ar" | "en", key: string, value: string) =>
    setSection((s) => (s ? { ...s, [code]: { ...s[code], [key]: value } } : s));

  const updateImage = (key: "desktop" | "mobile", url: string) =>
    setSection((s) => (s ? { ...s, images: { ...s.images, [key]: url } } : s));

  const updateAlt = (value: string) =>
    setSection((s) =>
      s ? { ...s, images: { ...s.images, alt: { ...s.images.alt, [lang]: value } } } : s,
    );

  const save = async () => {
    if (!current || !section) return;
    setSaving(true);
    try {
      setSection(await saveHeroSection(current.id, section));
      toast(t("hero_saved"));
    } catch {
      toast(t("error_title"), "error");
    } finally {
      setSaving(false);
    }
  };

  const l = section?.[lang];
  const canSave =
    section !== null &&
    (section.fr.titleLead.trim() !== "" || section.images.desktop !== "");

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <PageHeader title={t("hero_editor")} subtitle={t("hero_editor_hint")} />
        <TableSkeleton rows={6} cols={2} />
      </div>
    );
  }

  if (failed || !section || !l) {
    return (
      <div className="animate-fade-in space-y-4">
        <PageHeader title={t("hero_editor")} subtitle={t("hero_editor_hint")} />
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <ErrorState title={t("error_title")} onRetry={load} retryLabel={t("retry")} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("hero_editor")}
        subtitle={t("hero_editor_hint")}
        actions={
          <Button
            variant="primary"
            icon={<Save className="h-4 w-4" />}
            loading={saving}
            disabled={!canSave || saving}
            onClick={save}
          >
            {t("save")}
          </Button>
        }
      />

      <p className="max-w-2xl text-[13px] text-text-secondary">{t("hero_editor_note")}</p>

      {/* Language tabs — copy and alt text are per language; images are shared */}
      <div className="flex gap-1" role="tablist" aria-label={t("language")}>
        {LANGUAGES.map((x) => (
          <Button
            key={x.code}
            size="sm"
            variant={lang === x.code ? "primary" : "ghost"}
            aria-selected={lang === x.code}
            role="tab"
            onClick={() => setLang(x.code)}
          >
            {x.nativeName}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader title={t("hero_headline")} />
        <div className="space-y-4">
          <Field label={t("hero_title_lead")}>
            <Input value={l.titleLead} onChange={(e) => update(lang, "titleLead", e.target.value)} />
          </Field>
          <Field label={t("hero_title_tail")}>
            <Input value={l.titleTail} onChange={(e) => update(lang, "titleTail", e.target.value)} />
          </Field>
          <Field label={t("hero_support")}>
            <Textarea rows={2} value={l.support} onChange={(e) => update(lang, "support", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("hero_ctas")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("hero_primary_cta")}>
            <Input value={l.primaryCta} onChange={(e) => update(lang, "primaryCta", e.target.value)} />
          </Field>
          <Field label={t("hero_primary_href")}>
            <Input
              placeholder="/#collection"
              value={l.primaryHref ?? ""}
              onChange={(e) => update(lang, "primaryHref", e.target.value)}
            />
          </Field>
          <Field label={t("hero_secondary_cta")}>
            <Input value={l.secondaryCta} onChange={(e) => update(lang, "secondaryCta", e.target.value)} />
          </Field>
          <Field label={t("hero_secondary_href")}>
            <Input
              placeholder="/notre-histoire"
              value={l.secondaryHref ?? ""}
              onChange={(e) => update(lang, "secondaryHref", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("hero_images")} />
        {current && (
          <div className="grid gap-4 sm:grid-cols-2">
            <MediaField
              label={t("hero_image_desktop")}
              value={section.images.desktop}
              onChange={(url) => updateImage("desktop", url)}
              loadLibrary={async () => ({ items: await getMediaAssets(current.id) })}
              onUpload={async (file) => {
                const uploaded = await uploadMediaAsset({ tenantId: current.id, folder: "hero", file });
                return uploaded.url;
              }}
            />
            <MediaField
              label={t("hero_image_mobile")}
              value={section.images.mobile}
              onChange={(url) => updateImage("mobile", url)}
              loadLibrary={async () => ({ items: await getMediaAssets(current.id) })}
              onUpload={async (file) => {
                const uploaded = await uploadMediaAsset({ tenantId: current.id, folder: "hero", file });
                return uploaded.url;
              }}
            />
          </div>
        )}
        <div className="mt-4">
          <Field label={`${t("hero_image_alt")} — ${lang.toUpperCase()}`}>
            <Input value={section.images.alt[lang]} onChange={(e) => updateAlt(e.target.value)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
