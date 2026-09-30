"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageOff, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { MediaField } from "@/components/media/media-field";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/fields";
import { LanguageTabs } from "@/components/ui/language-tabs";
import type { LangCode, ProductAttribute, Variant } from "@/lib/domain";
import { formatCurrency } from "@/lib/format";
import {
  bulkUpdateVariants,
  createAttributeValue,
  createProductAttribute,
  createVariant,
  deleteAttributeValue,
  deleteProductAttribute,
  deleteVariant,
  generateVariants,
  getMediaAssets,
  getProductAttributes,
  getVariantName,
  getVariants,
  saveVariantTranslations,
  updateVariant,
  uploadMediaAsset,
} from "@/lib/services";

interface VariantDraft {
  name: string;
  nameAr: string;
  nameEn: string;
  priceMod: string;
  sku: string;
  barcode: string;
  weight: string;
  weightUnit: string;
  image: string;
  isAvailable: boolean;
  trackStock: boolean;
}

function draftFromVariant(variant: Variant): VariantDraft {
  const translated = (code: LangCode) =>
    variant.translations?.find((t) => t.languageCode === code)?.name ?? "";
  return {
    name: variant.name,
    nameAr: translated("ar"),
    nameEn: translated("en"),
    priceMod: String(variant.priceMod),
    sku: variant.sku ?? "",
    barcode: variant.barcode ?? "",
    weight: variant.weight === null ? "" : String(variant.weight),
    weightUnit: variant.weightUnit ?? "",
    image: variant.image ?? "",
    isAvailable: variant.isAvailable,
    trackStock: variant.trackStock,
  };
}

/**
 * Variant manager for one product.
 *
 * Two halves: the tenant's option vocabulary (which generates a matrix of
 * variants in one go) and the variant rows themselves — including the fields
 * the schema always had but central never exposed: per-variant name in three
 * languages, image, availability, stock tracking and weight.
 *
 * Options are tenant-level (`product_attributes` has no product column), so the
 * manager edits the shared vocabulary; a product's matrix is the subset its
 * variants use.
 */
export function VariantEditor({
  tenantId,
  productId,
  basePrice,
  variants,
  onChange,
}: {
  tenantId: string;
  productId: string;
  basePrice: number;
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();

  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMod, setNewMod] = useState("0");
  const [optionName, setOptionName] = useState("");
  const [optionType, setOptionType] = useState<"select" | "color">("select");
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Variant | null>(null);
  const [draft, setDraft] = useState<VariantDraft | null>(null);
  const [editLang, setEditLang] = useState<LangCode>("fr");

  const loadAttributes = useCallback(async () => {
    try {
      setAttributes(await getProductAttributes(tenantId));
    } catch {
      setAttributes([]);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadAttributes();
  }, [loadAttributes]);

  const report = (error: unknown) =>
    toast(error instanceof Error ? error.message : t("error_title"), "error");

  const reload = async () => onChange(await getVariants(productId));

  /* ---------- variants ---------- */

  const addVariant = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const created = await createVariant({
        tenantId,
        productId,
        name,
        priceMod: Number(newMod) || 0,
      });
      onChange([...variants, created]);
      setNewName("");
      setNewMod("0");
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const removeVariant = async (variant: Variant) => {
    setBusy(true);
    try {
      await deleteVariant(variant.id);
      onChange(variants.filter((v) => v.id !== variant.id));
      setSelected((ids) => ids.filter((id) => id !== variant.id));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    const blocked: string[] = [];
    for (const id of selected) {
      try {
        await deleteVariant(id);
      } catch {
        blocked.push(id);
      }
    }
    onChange(variants.filter((v) => blocked.includes(v.id)));
    setSelected(blocked);
    if (blocked.length > 0) toast(t("variants_delete_blocked"), "error");
    setBusy(false);
  };

  const setSelectedAvailability = async (available: boolean) => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await bulkUpdateVariants(selected, { isAvailable: available });
      onChange(
        variants.map((v) => (selected.includes(v.id) ? { ...v, isAvailable: available } : v)),
      );
      setSelected([]);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- options + matrix ---------- */

  const addOption = async () => {
    const name = optionName.trim();
    if (!name) return;
    try {
      const created = await createProductAttribute({ tenantId, name, type: optionType });
      setAttributes((list) => [...list, created]);
      setOptionName("");
    } catch (error) {
      report(error);
    }
  };

  const addValue = async (attribute: ProductAttribute) => {
    const value = (valueDraft[attribute.id] ?? "").trim();
    if (!value) return;
    try {
      const created = await createAttributeValue({
        tenantId,
        attributeId: attribute.id,
        value,
      });
      setAttributes((list) =>
        list.map((a) => (a.id === attribute.id ? { ...a, values: [...a.values, created] } : a)),
      );
      setValueDraft((d) => ({ ...d, [attribute.id]: "" }));
    } catch (error) {
      report(error);
    }
  };

  const removeOption = async (attribute: ProductAttribute) => {
    try {
      await deleteProductAttribute(attribute.id);
      await loadAttributes();
    } catch (error) {
      report(error);
    }
  };

  const removeValue = async (valueId: string) => {
    try {
      await deleteAttributeValue(valueId);
      await loadAttributes();
    } catch (error) {
      report(error);
    }
  };

  const includedAttributes = attributes.filter((a) => included[a.id] && a.values.length > 0);

  const generate = async () => {
    if (includedAttributes.length === 0 || busy) return;
    setBusy(true);
    try {
      // Cartesian product of the included options' values.
      let combinations: Record<string, string>[] = [{}];
      for (const attribute of includedAttributes) {
        const next: Record<string, string>[] = [];
        for (const combination of combinations) {
          for (const value of attribute.values) {
            next.push({ ...combination, [attribute.name]: value.value });
          }
        }
        combinations = next;
      }
      const created = await generateVariants({
        tenantId,
        productId,
        rows: combinations.map((attributeValues) => ({
          name: Object.values(attributeValues).join(" · "),
          attributeValues,
        })),
      });
      await reload();
      toast(created > 0 ? `${created} ${t("variants_created")}` : t("variants_none_created"));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- edit dialog ---------- */

  const openEditor = (variant: Variant) => {
    setEditing(variant);
    setDraft(draftFromVariant(variant));
    setEditLang("fr");
  };

  const saveEditor = async () => {
    if (!editing || !draft) return;
    setBusy(true);
    try {
      await updateVariant(editing.id, {
        name: draft.name,
        priceMod: Number(draft.priceMod) || 0,
        sku: draft.sku,
        barcode: draft.barcode,
        weight: draft.weight === "" ? null : Number(draft.weight),
        weightUnit: draft.weightUnit,
        image: draft.image,
        isAvailable: draft.isAvailable,
        trackStock: draft.trackStock,
      });
      // The base name stays on the variant; only the non-base languages are
      // written, so an existing `fr` row is never clobbered.
      await saveVariantTranslations(editing.id, draft.name, [
        { languageCode: "ar", name: draft.nameAr || null },
        { languageCode: "en", name: draft.nameEn || null },
      ]);
      await reload();
      setEditing(null);
      setDraft(null);
      toast(t("saved"));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const editedName = draft
    ? editLang === "ar"
      ? draft.nameAr
      : editLang === "en"
        ? draft.nameEn
        : draft.name
    : "";

  const finalPrice = basePrice + (Number(draft?.priceMod) || 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader
        title={t("variants")}
        subtitle={`${t("variants_hint")} · ${variants.length}`}
      />

      <div className="space-y-4 p-4">
        <div className="rounded-[var(--radius-sm)] border border-border bg-bg-inset/50 p-3">
          <p className="text-xs font-medium text-text-secondary">{t("variants_options")}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t("variants_options_hint")}</p>

          <ul className="mt-3 space-y-2">
            {attributes.map((attribute) => (
              <li key={attribute.id} className="rounded-[var(--radius-sm)] border border-border bg-bg-secondary p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text-primary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={Boolean(included[attribute.id])}
                      onChange={() =>
                        setIncluded((state) => ({
                          ...state,
                          [attribute.id]: !state[attribute.id],
                        }))
                      }
                    />
                    {attribute.name}
                  </label>
                  <Badge>{attribute.type === "color" ? t("variants_kind_color") : t("variants_kind_select")}</Badge>
                  <span className="ms-auto flex items-center gap-1">
                    {attribute.values.map((value) => (
                      <span
                        key={value.id}
                        className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-xs text-text-secondary"
                      >
                        {value.colorHex && (
                          <span
                            aria-hidden
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: value.colorHex }}
                          />
                        )}
                        {value.value}
                        <button
                          type="button"
                          onClick={() => void removeValue(value.id)}
                          aria-label={`${t("delete")} ${value.value}`}
                          className="cursor-pointer text-text-muted hover:text-danger"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => void removeOption(attribute)}
                      aria-label={`${t("delete")} ${attribute.name}`}
                      className="cursor-pointer rounded p-1 text-text-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={valueDraft[attribute.id] ?? ""}
                    onChange={(e) =>
                      setValueDraft((d) => ({ ...d, [attribute.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addValue(attribute);
                      }
                    }}
                    placeholder={t("variants_add_value")}
                    aria-label={`${t("variants_add_value")} — ${attribute.name}`}
                    className="h-8 flex-1"
                  />
                  <Button size="sm" onClick={() => void addValue(attribute)}>
                    {t("add")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              placeholder={t("variants_add_option")}
              aria-label={t("variants_add_option")}
              className="h-8 flex-1"
            />
            <Select
              value={optionType}
              onChange={(e) => setOptionType(e.target.value as "select" | "color")}
              aria-label={t("type")}
              className="h-8 sm:w-32"
            >
              <option value="select">{t("variants_kind_select")}</option>
              <option value="color">{t("variants_kind_color")}</option>
            </Select>
            <Button size="sm" onClick={() => void addOption()}>
              {t("add")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Layers className="h-4 w-4" />}
              disabled={includedAttributes.length === 0 || busy}
              onClick={() => void generate()}
            >
              {t("variants_generate")}
            </Button>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-accent bg-accent-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-text-primary">
              {selected.length} {t("media_selected")}
            </span>
            <span className="ms-auto flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void setSelectedAvailability(true)}>
                {t("available")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void setSelectedAvailability(false)}>
                {t("unavailable")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                disabled={busy}
                onClick={() => void removeSelected()}
              >
                {t("delete")}
              </Button>
            </span>
          </div>
        )}

        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-border">
          {variants.map((variant) => (
            <li key={variant.id} className="flex items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer"
                checked={selected.includes(variant.id)}
                onChange={() =>
                  setSelected((ids) =>
                    ids.includes(variant.id)
                      ? ids.filter((id) => id !== variant.id)
                      : [...ids, variant.id],
                  )
                }
                aria-label={getVariantName(variant, lang)}
              />
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-inset">
                {variant.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant-authored URL
                  <img
                    src={variant.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageOff className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text-primary">
                  {getVariantName(variant, lang)}
                </span>
                <span className="tnum block truncate text-xs text-text-muted">
                  {variant.priceMod === 0
                    ? t("variants_base_price")
                    : `${variant.priceMod > 0 ? "+" : ""}${formatCurrency(variant.priceMod)}`}
                  {variant.sku ? ` · ${variant.sku}` : ""}
                </span>
              </span>
              {!variant.isAvailable && <Badge tone="warning">{t("unavailable")}</Badge>}
              <Badge>→ {formatCurrency(basePrice + variant.priceMod)}</Badge>
              <button
                type="button"
                onClick={() => openEditor(variant)}
                aria-label={`${t("edit")} ${variant.name}`}
                className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-bg-surface hover:text-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeVariant(variant)}
                aria-label={`${t("delete")} ${variant.name}`}
                className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-danger-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {variants.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-text-muted">—</li>
          )}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addVariant();
              }
            }}
            placeholder={t("name")}
            aria-label={t("name")}
            className="flex-1"
          />
          <Input
            type="number"
            value={newMod}
            onChange={(e) => setNewMod(e.target.value)}
            aria-label={t("variants_price_mod")}
            className="sm:w-32"
          />
          <Button icon={<Plus className="h-4 w-4" />} loading={busy} onClick={() => void addVariant()}>
            {t("add")}
          </Button>
        </div>
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setDraft(null);
        }}
        title={editing ? getVariantName(editing, lang) : t("variants")}
        wide
      >
        {draft && (
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t("name")}
              </span>
              <LanguageTabs
                value={editLang}
                onChange={setEditLang}
                className="border-b border-border"
              />
              <Input
                value={editedName}
                onChange={(e) => {
                  const value = e.target.value;
                  if (editLang === "ar") setDraft({ ...draft, nameAr: value });
                  else if (editLang === "en") setDraft({ ...draft, nameEn: value });
                  else setDraft({ ...draft, name: value });
                }}
                dir={editLang === "ar" ? "rtl" : "ltr"}
                aria-label={t("name")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("variants_price_mod")} hint={`→ ${formatCurrency(finalPrice)}`}>
                <Input
                  type="number"
                  value={draft.priceMod}
                  onChange={(e) => setDraft({ ...draft, priceMod: e.target.value })}
                />
              </Field>
              <Field label={t("sku")}>
                <Input
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label={t("barcode")}>
                <Input
                  value={draft.barcode}
                  onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label={t("variant_weight_unit")}>
                <Input
                  value={draft.weightUnit}
                  onChange={(e) => setDraft({ ...draft, weightUnit: e.target.value })}
                  placeholder="g / kg / ml"
                />
              </Field>
              <Field label={t("variant_weight")}>
                <Input
                  type="number"
                  value={draft.weight}
                  onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                  placeholder="—"
                />
              </Field>
              <Field label={t("variant_track_stock")}>
                <Switch
                  checked={draft.trackStock}
                  onChange={(trackStock) => setDraft({ ...draft, trackStock })}
                  label={t("variant_track_stock")}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-bg-inset px-3 py-2.5 text-[13px]">
              <span className="text-text-secondary">{t("available")}</span>
              <Switch
                checked={draft.isAvailable}
                onChange={(isAvailable) => setDraft({ ...draft, isAvailable })}
                label={t("available")}
              />
            </div>

            <MediaField
              label={t("variant_image")}
              value={draft.image}
              onChange={(image) => setDraft({ ...draft, image })}
              loadLibrary={async () => ({ items: await getMediaAssets(tenantId) })}
              onUpload={async (file) => (await uploadMediaAsset({ tenantId, file })).url}
            />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setEditing(null);
                  setDraft(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void saveEditor()}>
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
