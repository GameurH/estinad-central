"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/fields";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { LanguageTabs } from "@/components/ui/language-tabs";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { ProductMediaManager } from "@/components/products/product-media-manager";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  getVariantName,
  saveProductTranslations,
  updateProduct,
} from "@/lib/services";
import { formatCurrency } from "@/lib/format";
import type {
  Category,
  LangCode,
  PrinterDest,
  Product,
  ProductTranslation,
  ProductType,
  Variant,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export interface ProductDraft {
  name: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  type: ProductType;
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  sku: string;
  barcode: string;
  isAvailable: boolean;
  printerDest: PrinterDest;
  shortDescription: string;
  /** Base (French) long copy → `products.long_description`. */
  longDescription: string;
  longDescriptionAr: string;
  longDescriptionEn: string;
}

export function draftFromProduct(
  p: Product,
  translations: ProductTranslation[] = [],
): ProductDraft {
  const byLang = new Map(translations.map((t) => [t.languageCode, t]));
  return {
    name: p.name,
    nameFr: byLang.get("fr")?.name ?? "",
    nameAr: byLang.get("ar")?.name ?? "",
    nameEn: byLang.get("en")?.name ?? "",
    type: p.type,
    price: p.price,
    costPrice: p.costPrice,
    categoryId: p.categoryId,
    sku: p.sku ?? "",
    barcode: p.barcode ?? "",
    isAvailable: p.isAvailable,
    printerDest: p.printerDest,
    shortDescription: p.shortDescription ?? "",
    longDescription: p.longDescription ?? "",
    longDescriptionAr: byLang.get("ar")?.longDescription ?? "",
    longDescriptionEn: byLang.get("en")?.longDescription ?? "",
  };
}

export const EMPTY_DRAFT: ProductDraft = {
  name: "",
  nameFr: "",
  nameAr: "",
  nameEn: "",
  type: "simple",
  price: 0,
  costPrice: null,
  categoryId: null,
  sku: "",
  barcode: "",
  isAvailable: true,
  printerDest: "kitchen",
  shortDescription: "",
  longDescription: "",
  longDescriptionAr: "",
  longDescriptionEn: "",
};

function marginPct(price: number, cost: number | null): number | null {
  if (!cost || cost <= 0 || price <= 0) return null;
  return Math.round(((price - cost) / price) * 100);
}

export function ProductForm({
  initial,
  categories,
  variants,
  productId,
  tenantId,
  mode,
}: {
  initial: ProductDraft;
  categories: Category[];
  variants: Variant[];
  productId?: string;
  tenantId: string;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [tab, setTab] = useState<"details" | "variants">("details");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localVariants, setLocalVariants] = useState<Variant[]>(variants);
  const [variantName, setVariantName] = useState("");
  const [variantMod, setVariantMod] = useState("0");
  const [nameLang, setNameLang] = useState<LangCode>("fr");
  const [descLang, setDescLang] = useState<LangCode>("fr");

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );

  // Unsaved-changes guard.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const nameValue =
    nameLang === "ar" ? draft.nameAr : nameLang === "en" ? draft.nameEn : draft.nameFr;

  const setName = (value: string) => {
    if (nameLang === "ar") set("nameAr", value);
    else if (nameLang === "en") set("nameEn", value);
    else set("nameFr", value);
  };

  const longDescriptionValue =
    descLang === "ar"
      ? draft.longDescriptionAr
      : descLang === "en"
        ? draft.longDescriptionEn
        : draft.longDescription;

  const setLongDescription = (value: string) => {
    if (descLang === "ar") set("longDescriptionAr", value);
    else if (descLang === "en") set("longDescriptionEn", value);
    else set("longDescription", value);
  };

  const valid = draft.name.trim().length >= 2 && draft.price >= 0;
  const margin = marginPct(draft.price, draft.costPrice);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // `products.name` holds the primary name; the per-language rows in
      // `product_translations` hold what the storefront shows for each language
      // (the base catalog is English, so the `fr` row is a real translation).
      const translations = [
        {
          languageCode: "fr" as const,
          name: draft.nameFr || null,
          longDescription: draft.longDescription || null,
        },
        {
          languageCode: "ar" as const,
          name: draft.nameAr || null,
          longDescription: draft.longDescriptionAr || null,
        },
        {
          languageCode: "en" as const,
          name: draft.nameEn || null,
          longDescription: draft.longDescriptionEn || null,
        },
      ];

      if (mode === "create") {
        const id = await createProduct({
          tenantId,
          name: draft.name,
          type: draft.type,
          price: draft.price,
          costPrice: draft.costPrice,
          categoryId: draft.categoryId,
          sku: draft.sku || null,
          barcode: draft.barcode || null,
          isAvailable: draft.isAvailable,
          printerDest: draft.printerDest,
          shortDescription: draft.shortDescription || null,
          longDescription: draft.longDescription || null,
        });
        for (const v of localVariants) {
          await createVariant({
            tenantId,
            productId: id,
            name: v.name,
            priceMod: v.priceMod,
          });
        }
        await saveProductTranslations(id, draft.name, translations);
        toast(t("product_created"));
        router.push(`/products/${id}`);
      } else if (productId) {
        await updateProduct(productId, {
          name: draft.name,
          type: draft.type,
          price: draft.price,
          costPrice: draft.costPrice,
          categoryId: draft.categoryId,
          sku: draft.sku || null,
          barcode: draft.barcode || null,
          isAvailable: draft.isAvailable,
          printerDest: draft.printerDest,
          shortDescription: draft.shortDescription || null,
          longDescription: draft.longDescription || null,
        });
        await saveProductTranslations(productId, draft.name, translations);
        toast(t("product_saved"));
        router.push("/products");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!productId) return;
    setConfirmDelete(false);
    try {
      await deleteProduct(productId);
      toast(t("product_deleted"));
      router.push("/products");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const addVariant = async () => {
    const name = variantName.trim();
    if (!name) return;
    const mod = Number(variantMod) || 0;
    // Create mode: stage locally until the product exists.
    if (mode === "create" || !productId) {
      setLocalVariants((list) => [
        ...list,
        {
          id: `v-local-${Date.now()}`,
          tenantId,
          productId: productId ?? "",
          name,
          priceMod: mod,
          sku: null,
          barcode: null,
        },
      ]);
      setVariantName("");
      setVariantMod("0");
      return;
    }
    try {
      const created = await createVariant({ tenantId, productId, name, priceMod: mod });
      setLocalVariants((list) => [...list, created]);
      setVariantName("");
      setVariantMod("0");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const removeVariant = async (id: string) => {
    const isLocal = id.startsWith("v-local-");
    if (isLocal || mode === "create" || !productId) {
      setLocalVariants((l) => l.filter((x) => x.id !== id));
      return;
    }
    try {
      await deleteVariant(id);
      setLocalVariants((l) => l.filter((x) => x.id !== id));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const tabs = [
    { id: "details" as const, label: t("details") },
    ...(draft.type === "variable"
      ? [{ id: "variants" as const, label: `${t("variants")} (${localVariants.length})` }]
      : []),
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            aria-selected={tab === tb.id}
            role="tab"
            className={cn(
              "relative cursor-pointer px-3 py-2 text-[13px] font-medium transition-colors",
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

      {tab === "details" && (
        <div className="animate-fade-in grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            <Card>
              <CardHeader title={t("details")} />
              <div className="space-y-4 p-4">
                <Field label={t("name")} hint={t("name_primary_hint")}>
                  <Input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Couscous royal"
                    autoFocus={mode === "create"}
                  />
                </Field>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t("name_translations")}
                  </span>
                  <LanguageTabs
                    value={nameLang}
                    onChange={setNameLang}
                    className="border-b border-border"
                  />
                  <Input
                    value={nameValue}
                    onChange={(e) => setName(e.target.value)}
                    dir={nameLang === "ar" ? "rtl" : "ltr"}
                    aria-label={t("name_translations")}
                    placeholder={draft.name || "…"}
                  />
                  <span className="mt-1 block text-xs text-text-muted">
                    {t("name_hint")}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t("category")}>
                    <Select
                      value={draft.categoryId ?? ""}
                      onChange={(e) => set("categoryId", e.target.value || null)}
                    >
                      <option value="">{t("none")}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("type")}>
                    <Select
                      value={draft.type}
                      onChange={(e) => set("type", e.target.value as ProductType)}
                    >
                      <option value="simple">{t("simple")}</option>
                      <option value="variable">{t("variable")}</option>
                      <option value="composite">{t("composite")}</option>
                    </Select>
                  </Field>
                </div>
                <Field label={t("description")}>
                  <Textarea
                    value={draft.shortDescription}
                    onChange={(e) => set("shortDescription", e.target.value)}
                    placeholder="Description courte…"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t("sku")}>
                    <Input
                      value={draft.sku}
                      onChange={(e) => set("sku", e.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  <Field label={t("barcode")}>
                    <Input
                      value={draft.barcode}
                      onChange={(e) => set("barcode", e.target.value)}
                      className="font-mono"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label={t("printer")}>
                    <Select
                      value={draft.printerDest ?? ""}
                      onChange={(e) =>
                        set("printerDest", (e.target.value || null) as PrinterDest)
                      }
                    >
                      <option value="">{t("none")}</option>
                      <option value="kitchen">{t("kitchen")}</option>
                      <option value="bar">{t("bar")}</option>
                      <option value="oven">{t("oven")}</option>
                    </Select>
                  </Field>
                </div>
              </div>
            </Card>

            {productId ? (
              <ProductMediaManager tenantId={tenantId} productId={productId} />
            ) : (
              <Card>
                <CardHeader title={t("media")} subtitle={t("media_save_first")} />
              </Card>
            )}

            <Card>
              <CardHeader
                title={t("long_description")}
                subtitle={t("long_description_hint")}
              />
              <LanguageTabs
                value={descLang}
                onChange={setDescLang}
                className="border-b border-border px-4"
              />
              <div className="p-4">
                <MarkdownEditor
                  value={longDescriptionValue}
                  onChange={setLongDescription}
                  dir={descLang === "ar" ? "rtl" : "ltr"}
                  ariaLabel={t("long_description")}
                  placeholder={t("long_description_hint")}
                />
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader title={t("pricing")} />
              <div className="space-y-4 p-4">
                <Field label={t("price")}>
                  <Input
                    type="number"
                    min={0}
                    value={draft.price}
                    onChange={(e) => set("price", Number(e.target.value))}
                  />
                </Field>
                <Field label={t("cost_price")}>
                  <Input
                    type="number"
                    min={0}
                    value={draft.costPrice ?? ""}
                    onChange={(e) =>
                      set("costPrice", e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder="—"
                  />
                </Field>
                <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-bg-inset px-3 py-2.5 text-[13px]">
                  <span className="text-text-secondary">{t("margin")}</span>
                  <span className="tnum font-semibold text-text-primary">
                    {margin === null
                      ? "—"
                      : `${margin}% · ${formatCurrency(draft.price - (draft.costPrice ?? 0))}`}
                  </span>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{t("available")}</p>
                  <p className="text-xs text-text-muted">{t("status")}</p>
                </div>
                <Switch
                  checked={draft.isAvailable}
                  onChange={(v) => set("isAvailable", v)}
                  label={t("available")}
                />
              </div>
            </Card>
            {mode === "edit" && (
              <Button
                variant="ghost"
                className="w-full text-danger hover:text-danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                {t("delete")}
              </Button>
            )}
          </div>
        </div>
      )}

      {tab === "variants" && (
        <Card className="animate-fade-in">
          <CardHeader
            title={t("variants")}
            subtitle={`Prix final = base + ajustement`}
          />
          <ul className="divide-y divide-[var(--border)]">
            {localVariants.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">
                    {getVariantName(v, lang)}
                  </span>
                  <span className="tnum block text-xs text-text-muted">
                    {v.priceMod === 0
                      ? "base"
                      : `${v.priceMod > 0 ? "+" : ""}${formatCurrency(v.priceMod)}`}
                  </span>
                </span>
                <Badge>→ {formatCurrency(draft.price + v.priceMod)}</Badge>
                <button
                  onClick={() => removeVariant(v.id)}
                  aria-label={`${t("delete")} ${v.name}`}
                  className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-danger-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {localVariants.length === 0 && (
              <li className="px-4 py-8 text-center text-[13px] text-text-muted">—</li>
            )}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row">
            <Input
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder={t("name")}
              aria-label={t("name")}
              className="flex-1"
            />
            <Input
              type="number"
              value={variantMod}
              onChange={(e) => setVariantMod(e.target.value)}
              aria-label={t("price")}
              className="sm:w-32"
            />
            <Button icon={<Plus className="h-4 w-4" />} onClick={addVariant}>
              {t("add")}
            </Button>
          </div>
        </Card>
      )}

      {/* Save bar — slides in when dirty */}
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
              <Button size="sm" variant="primary" loading={saving} disabled={!valid} onClick={save}>
                {t("save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom action row (always visible, keyboard reachable) */}
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push("/products")}>{t("cancel")}</Button>
        <Button variant="primary" loading={saving} disabled={!valid || (!dirty && mode === "edit")} onClick={save}>
          {t("save")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("confirm_delete_title")}
        body={t("confirm_delete_body")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}
