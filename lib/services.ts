/**
 * Service layer — the ONLY boundary between UI and data.
 *
 * Reads and writes go to Supabase (project `rms`) through the browser client,
 * so every query is RLS-enforced for the signed-in merchant. Signatures are
 * stable: swapping the backend later still means touching only this file.
 *
 * Table notes (live schema):
 * - `products.tenant_id` / `orders.tenant_id` are TEXT (uuid rendered as
 *   string); `tenant_owners.tenant_id` is UUID — both compare fine as strings.
 * - `products.pb_id` / `categories.pb_id` are NOT NULL without defaults, so
 *   admin-created rows get a `central-*` pb_id (POS sync owns the rest).
 * - Deletes cascade to translations + variants; `order_lines.product_id` and
 *   `products.category_id` are NO ACTION — callers surface friendly errors.
 */
import { getSupabase } from "@/lib/supabase/client";
import type {
  BrandConfig,
  Category,
  DailySales,
  DashboardSummary,
  HourlySales,
  LangCode,
  Language,
  OnlineOrder,
  Order,
  OrderLine,
  OrderStatus,
  OrderType,
  PaymentBreakdown,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductPerformance,
  ProductTranslation,
  ShippingStatus,
  Tenant,
  TenantStatus,
  Variant,
} from "@/lib/domain";

type Row = { [k: string]: unknown };

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function rowsOf(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : [];
}

function oneOf(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

function fail(op: string, err: unknown): never {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "unknown error";
  throw new Error(`${op}: ${msg}`);
}

const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "void",
];

function asOrderStatus(v: unknown): OrderStatus {
  return ORDER_STATUSES.includes(v as OrderStatus) ? (v as OrderStatus) : "draft";
}

const ORDER_TYPES: OrderType[] = ["dine_in", "takeaway", "delivery"];

function asOrderType(v: unknown): OrderType {
  return ORDER_TYPES.includes(v as OrderType) ? (v as OrderType) : "dine_in";
}

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "cib_card", "edahabia", "check", "qr"];

function asPaymentMethod(v: unknown): PaymentMethod | null {
  return PAYMENT_METHODS.includes(v as PaymentMethod) ? (v as PaymentMethod) : null;
}

const SHIPPING: ShippingStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

/** Live data also carries `processing` — closest match is `preparing`. */
function asShippingStatus(v: unknown): ShippingStatus {
  if (v === "processing") return "preparing";
  return SHIPPING.includes(v as ShippingStatus) ? (v as ShippingStatus) : "pending";
}

const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];

function asPaymentStatus(v: unknown): PaymentStatus {
  return PAYMENT_STATUSES.includes(v as PaymentStatus)
    ? (v as PaymentStatus)
    : "pending";
}

/* ---------- Translation cache (keeps name helpers synchronous) ---------- */

const LANG_CODES: LangCode[] = ["fr", "ar", "en"];

/** Normalises live `language_code` values (fr, ar, en, fra, ara, eng, ar-SA…). */
function asLangCode(v: unknown): LangCode | null {
  const code = str(v).toLowerCase().slice(0, 2);
  return LANG_CODES.includes(code as LangCode) ? (code as LangCode) : null;
}

interface TrEntry {
  name: string;
  short: string | null;
}

const trCache = {
  product: new Map<string, Map<string, TrEntry>>(),
  category: new Map<string, Map<string, TrEntry>>(),
  variant: new Map<string, Map<string, TrEntry>>(),
};

function seedBase(
  kind: keyof typeof trCache,
  id: string,
  baseName: string,
  baseShort: string | null = null,
) {
  let m = trCache[kind].get(id);
  if (!m) {
    m = new Map();
    trCache[kind].set(id, m);
  }
  if (!m.has("fr")) m.set("fr", { name: baseName, short: baseShort });
}

function putTr(
  kind: keyof typeof trCache,
  id: string,
  lang: string,
  name: string,
  short: string | null = null,
) {
  let m = trCache[kind].get(id);
  if (!m) {
    m = new Map();
    trCache[kind].set(id, m);
  }
  m.set(lang, { name, short });
}

/* ---------- Tenants ---------- */

function emptyBrand(): BrandConfig {
  const blank = { fr: "", ar: "", en: "" };
  return {
    tagline: { ...blank },
    siteTitle: { ...blank },
    metaDescription: { ...blank },
    logoUrl: null,
  };
}

function pickLangText(v: unknown): { fr: string; ar: string; en: string } {
  const out = { fr: "", ar: "", en: "" };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["fr", "ar", "en"] as const) {
      if (typeof o[k] === "string") out[k] = o[k] as string;
    }
  } else if (typeof v === "string" && v !== "") {
    out.fr = v;
  }
  return out;
}

function mapTenant(r: Row): Tenant {
  const rawConfig =
    r.config && typeof r.config === "object" ? (r.config as Record<string, unknown>) : {};
  const rawBrand =
    rawConfig.brand && typeof rawConfig.brand === "object"
      ? (rawConfig.brand as Record<string, unknown>)
      : {};
  const brand = emptyBrand();
  brand.tagline = pickLangText(rawBrand.tagline);
  brand.siteTitle = pickLangText(rawBrand.siteTitle);
  brand.metaDescription = pickLangText(rawBrand.meta_description ?? rawBrand.metaDescription);
  if (typeof rawBrand.logoUrl === "string") brand.logoUrl = rawBrand.logoUrl;
  if (typeof rawBrand.logo_url === "string") brand.logoUrl = rawBrand.logo_url as string;

  const statuses: TenantStatus[] = ["trial", "active", "suspended", "cancelled"];
  const status = statuses.includes(r.status as TenantStatus)
    ? (r.status as TenantStatus)
    : "trial";

  return {
    id: str(r.id),
    name: str(r.name),
    slug: str(r.slug),
    status,
    businessName: strOrNull(r.business_name),
    businessAddress: strOrNull(r.business_address),
    businessType: strOrNull(r.business_type),
    ownerEmail: strOrNull(r.owner_email),
    ownerPhone: strOrNull(r.owner_phone),
    trialEndsAt: strOrNull(r.trial_ends_at),
    storefrontEnabled: bool(r.storefront_enabled),
    storefrontSlug: strOrNull(r.storefront_slug),
    storefrontDescription: strOrNull(r.storefront_description),
    onlineOrderingEnabled: bool(r.online_ordering_enabled),
    deliveryEnabled: bool(r.delivery_enabled, true),
    pickupEnabled: bool(r.pickup_enabled, true),
    dineInEnabled: bool(r.dine_in_enabled),
    reservationsEnabled: bool(r.reservations_enabled),
    minOrderAmount: num(r.min_order_amount),
    estimatedPrepTime: num(r.estimated_prep_time, 30),
    autoAcceptOrders: bool(r.auto_accept_orders),
    latitude: typeof r.restaurant_latitude === "number" ? (r.restaurant_latitude as number) : r.restaurant_latitude != null ? num(r.restaurant_latitude) : null,
    longitude: typeof r.restaurant_longitude === "number" ? (r.restaurant_longitude as number) : r.restaurant_longitude != null ? num(r.restaurant_longitude) : null,
    brand,
    createdAt: str(r.created_at),
  };
}

export async function getTenants(): Promise<Tenant[]> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];

  const { data: memberships, error: mErr } = await sb
    .from("tenant_owners")
    .select("tenant_id")
    .eq("user_id", user.id);
  if (mErr) fail("load memberships", mErr);
  const ids = rowsOf(memberships).map((m) => str(m.tenant_id)).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await sb.from("tenants").select("*").in("id", ids);
  if (error) fail("load tenants", error);
  return rowsOf(data)
    .map(mapTenant)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTenant(id: string): Promise<Tenant | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("tenants").select("*").eq("id", id).maybeSingle();
  if (error) fail("load tenant", error);
  const row = oneOf(data);
  return row ? mapTenant(row) : null;
}

export function trialDaysLeft(tenant: Tenant): number | null {
  if (tenant.status !== "trial" || !tenant.trialEndsAt) return null;
  return Math.max(
    0,
    Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400_000),
  );
}

/* ---------- Catalog ---------- */

export interface ProductListItem extends Product {
  categoryName: string | null;
  variantCount: number;
}

function mapProduct(r: Row): Product {
  const types = ["simple", "variable", "composite"] as const;
  const type = types.includes(r.type as (typeof types)[number])
    ? (r.type as Product["type"])
    : "simple";
  const printers = ["kitchen", "bar", "oven"] as const;
  const printerDest = printers.includes(r.printer_dest as (typeof printers)[number])
    ? (r.printer_dest as NonNullable<Product["printerDest"]>)
    : null;
  const images = Array.isArray(r.images)
    ? (r.images as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    name: str(r.name),
    type,
    price: num(r.price),
    costPrice: r.cost_price == null ? null : num(r.cost_price),
    categoryId: strOrNull(r.category_id),
    sku: strOrNull(r.sku),
    barcode: strOrNull(r.barcode),
    isAvailable: r.is_available == null ? true : bool(r.is_available, true),
    image: strOrNull(r.image) ?? (images[0] ?? null),
    images,
    printerDest,
    shortDescription: strOrNull(r.short_description),
    longDescription: strOrNull(r.long_description),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export async function getProducts(tenantId: string): Promise<ProductListItem[]> {
  const sb = getSupabase();
  const [{ data: pData, error: pErr }, { data: cData, error: cErr }] = await Promise.all([
    sb.from("products").select("*").eq("tenant_id", tenantId).order("name"),
    sb.from("categories").select("id,name").eq("tenant_id", tenantId),
  ]);
  if (pErr) fail("load products", pErr);
  if (cErr) fail("load categories", cErr);

  const products = rowsOf(pData);
  const categories = new Map(rowsOf(cData).map((c) => [str(c.id), str(c.name)]));

  const ids = products.map((p) => str(p.id));
  const [vRes, tRes] = await Promise.all([
    ids.length > 0
      ? sb.from("variants").select("product_id").in("product_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? sb.from("product_translations").select("product_id,language_code,name,short_description").in("product_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vRes.error) fail("load variant counts", vRes.error);
  if (tRes.error) fail("load product translations", tRes.error);

  const counts = new Map<string, number>();
  for (const v of rowsOf(vRes.data)) {
    const pid = str(v.product_id);
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  for (const p of products) {
    seedBase("product", str(p.id), str(p.name), strOrNull(p.short_description));
  }
  for (const t of rowsOf(tRes.data)) {
    putTr("product", str(t.product_id), str(t.language_code), str(t.name), strOrNull(t.short_description));
  }

  return products.map((p) => {
    const base = mapProduct(p);
    return {
      ...base,
      categoryName: base.categoryId ? (categories.get(base.categoryId) ?? null) : null,
      variantCount: counts.get(base.id) ?? 0,
    };
  });
}

export async function getProduct(
  tenantId: string,
  id: string,
): Promise<
  (Product & { variants: Variant[]; translations: ProductTranslation[] }) | null
> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("load product", error);
  const row = oneOf(data);
  if (!row) return null;

  const [{ data: vData, error: vErr }, { data: tData, error: tErr }] = await Promise.all([
    sb.from("variants").select("*").eq("product_id", id).order("name"),
    sb
      .from("product_translations")
      .select("language_code,name,short_description,long_description")
      .eq("product_id", id),
  ]);
  if (vErr) fail("load variants", vErr);
  if (tErr) fail("load product translations", tErr);

  const product = mapProduct(row);
  seedBase("product", product.id, product.name, product.shortDescription);

  const translations: ProductTranslation[] = [];
  for (const t of rowsOf(tData)) {
    const languageCode = asLangCode(t.language_code);
    if (!languageCode) continue;
    putTr("product", product.id, languageCode, str(t.name), strOrNull(t.short_description));
    translations.push({
      productId: product.id,
      languageCode,
      name: str(t.name),
      shortDescription: strOrNull(t.short_description),
      longDescription: strOrNull(t.long_description),
    });
  }

  const variants = rowsOf(vData).map(mapVariant);
  const vIds = variants.map((v) => v.id);
  if (vIds.length > 0) {
    const { data: vtData, error: vtErr } = await sb
      .from("variant_translations")
      .select("variant_id,language_code,name")
      .in("variant_id", vIds);
    if (vtErr) fail("load variant translations", vtErr);
    for (const v of variants) seedBase("variant", v.id, v.name);
    for (const t of rowsOf(vtData)) {
      putTr("variant", str(t.variant_id), str(t.language_code), str(t.name));
    }
  }

  return { ...product, variants, translations };
}

function mapVariant(r: Row): Variant {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    productId: str(r.product_id),
    name: str(r.name),
    priceMod: num(r.price_mod),
    sku: strOrNull(r.sku),
    barcode: strOrNull(r.barcode),
  };
}

export async function getCategories(tenantId: string): Promise<Category[]> {
  const sb = getSupabase();
  const [{ data: cData, error: cErr }, { data: pData, error: pErr }] = await Promise.all([
    sb.from("categories").select("*").eq("tenant_id", tenantId).order("name"),
    sb.from("products").select("id,category_id").eq("tenant_id", tenantId),
  ]);
  if (cErr) fail("load categories", cErr);
  if (pErr) fail("load category counts", pErr);

  const counts = new Map<string, number>();
  for (const p of rowsOf(pData)) {
    const cid = strOrNull(p.category_id);
    if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  const cats = rowsOf(cData);
  const ids = cats.map((c) => str(c.id));
  if (ids.length > 0) {
    const { data: tData, error: tErr } = await sb
      .from("category_translations")
      .select("category_id,language_code,name")
      .in("category_id", ids);
    if (tErr) fail("load category translations", tErr);
    for (const c of cats) seedBase("category", str(c.id), str(c.name));
    for (const t of rowsOf(tData)) {
      putTr("category", str(t.category_id), str(t.language_code), str(t.name));
    }
  }

  const types = ["retail", "hospitality", "service"] as const;
  return cats.map((c) => ({
    id: str(c.id),
    tenantId: str(c.tenant_id),
    name: str(c.name),
    type: types.includes(c.type as (typeof types)[number])
      ? (c.type as Category["type"])
      : "hospitality",
    parentId: strOrNull(c.parent_id),
    productCount: counts.get(str(c.id)) ?? 0,
  }));
}

export async function getLanguages(): Promise<Language[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("languages").select("*").order("code");
  if (error) fail("load languages", error);
  const known: LangCode[] = ["fr", "ar", "en"];
  return rowsOf(data)
    .filter((l) => known.includes(str(l.code) as LangCode))
    .map((l) => ({
      code: str(l.code) as LangCode,
      name: str(l.name),
      nativeName: str(l.native_name),
      isDefault: bool(l.is_default),
      isRtl: bool(l.is_rtl),
      isActive: l.is_active == null ? true : bool(l.is_active, true),
    }));
}

function trName(
  kind: keyof typeof trCache,
  id: string,
  base: string,
  lang: string,
): string {
  if (lang === "fr") return base;
  return trCache[kind].get(id)?.get(lang)?.name ?? base;
}

export function getProductName(product: Product, lang: string): string {
  return trName("product", product.id, product.name, lang);
}

export function getCategoryName(category: Category, lang: string): string {
  return trName("category", category.id, category.name, lang);
}

export function getVariantName(variant: Variant, lang: string): string {
  return trName("variant", variant.id, variant.name, lang);
}

export function missingTranslationLangs(
  kind: "product" | "category" | "variant",
  id: string,
): string[] {
  const m = trCache[kind].get(id);
  if (!m) return [];
  return ["ar", "en"].filter((l) => !m.has(l));
}

/* ---------- Product / variant / category mutations ---------- */

function localPbId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `central-${Date.now().toString(36)}-${rand}`;
}

export interface ProductInput {
  tenantId: string;
  name: string;
  type: Product["type"];
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  isAvailable: boolean;
  printerDest: Product["printerDest"];
  shortDescription: string | null;
  longDescription: string | null;
}

export async function createProduct(input: ProductInput): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("products")
    .insert({
      tenant_id: input.tenantId,
      pb_id: localPbId(),
      name: input.name.trim(),
      type: input.type,
      price: input.price,
      cost_price: input.costPrice,
      category_id: input.categoryId,
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      is_available: input.isAvailable,
      printer_dest: input.printerDest,
      short_description: input.shortDescription?.trim() || null,
      long_description: input.longDescription?.trim() || null,
    })
    .select("id")
    .single();
  if (error) fail("create product", error);
  return str(oneOf(data)?.id);
}

export async function updateProduct(
  id: string,
  patch: Partial<ProductInput>,
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.costPrice !== undefined) row.cost_price = patch.costPrice;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.sku !== undefined) row.sku = patch.sku?.trim() || null;
  if (patch.barcode !== undefined) row.barcode = patch.barcode?.trim() || null;
  if (patch.isAvailable !== undefined) row.is_available = patch.isAvailable;
  if (patch.printerDest !== undefined) row.printer_dest = patch.printerDest;
  if (patch.shortDescription !== undefined)
    row.short_description = patch.shortDescription?.trim() || null;
  if (patch.longDescription !== undefined)
    row.long_description = patch.longDescription?.trim() || null;
  const { error } = await sb.from("products").update(row).eq("id", id);
  if (error) fail("update product", error);
}

/**
 * Persists per-language storefront long descriptions in `product_translations`.
 *
 * Only `long_description` is written: `name`/`short_description` are owned by
 * the POS sync and must not be clobbered. Rows are created on demand (with the
 * base product name, which the storefront already falls back to) and existing
 * rows are updated in place. Clearing a description sets it back to NULL and
 * never orphans an empty row.
 */
export async function saveProductLongDescriptions(
  productId: string,
  baseName: string,
  entries: { languageCode: LangCode; longDescription: string | null }[],
): Promise<void> {
  if (entries.length === 0) return;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("product_translations")
    .select("language_code")
    .eq("product_id", productId);
  if (error) fail("load product translations", error);
  const existing = new Map<LangCode, string>();
  for (const r of rowsOf(data)) {
    const code = asLangCode(r.language_code);
    const raw = str(r.language_code);
    if (code && raw) existing.set(code, raw);
  }

  for (const entry of entries) {
    const value = entry.longDescription?.trim() || null;
    const rawLanguage = existing.get(entry.languageCode);
    if (rawLanguage) {
      const { error: upErr } = await sb
        .from("product_translations")
        .update({ long_description: value })
        .eq("product_id", productId)
        .eq("language_code", rawLanguage);
      if (upErr) fail("save product description", upErr);
    } else if (value) {
      const { error: inErr } = await sb.from("product_translations").insert({
        product_id: productId,
        language_code: entry.languageCode,
        name: baseName.trim() || "—",
        long_description: value,
      });
      if (inErr) fail("save product description", inErr);
    }
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) {
    if (String((error as { code?: string }).code) === "23503") {
      throw new Error("product is used by existing orders and cannot be deleted");
    }
    fail("delete product", error);
  }
}

export async function createVariant(input: {
  tenantId: string;
  productId: string;
  name: string;
  priceMod: number;
}): Promise<Variant> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("variants")
    .insert({
      tenant_id: input.tenantId,
      product_id: input.productId,
      name: input.name.trim(),
      price_mod: input.priceMod,
    })
    .select("*")
    .single();
  if (error) fail("create variant", error);
  const row = oneOf(data);
  if (!row) throw new Error("create variant: no row returned");
  return mapVariant(row);
}

export async function deleteVariant(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("variants").delete().eq("id", id);
  if (error) {
    if (String((error as { code?: string }).code) === "23503") {
      throw new Error("variant is used by existing orders and cannot be deleted");
    }
    fail("delete variant", error);
  }
}

export interface CategoryInput {
  tenantId: string;
  name: string;
  type: Category["type"];
  parentId: string | null;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .insert({
      tenant_id: input.tenantId,
      pb_id: localPbId(),
      name: input.name.trim(),
      type: input.type,
      parent_id: input.parentId,
    })
    .select("*")
    .single();
  if (error) fail("create category", error);
  const row = oneOf(data);
  if (!row) throw new Error("create category: no row returned");
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    name: str(row.name),
    type: input.type,
    parentId: strOrNull(row.parent_id),
    productCount: 0,
  };
}

export async function updateCategory(
  id: string,
  patch: Partial<Omit<CategoryInput, "tenantId">>,
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.parentId !== undefined) row.parent_id = patch.parentId;
  const { error } = await sb.from("categories").update(row).eq("id", id);
  if (error) fail("update category", error);
}

export async function deleteCategory(id: string): Promise<void> {
  const sb = getSupabase();
  // FK is NO ACTION on children: re-parent first, then delete.
  const { error: reErr } = await sb
    .from("categories")
    .update({ parent_id: null })
    .eq("parent_id", id);
  if (reErr) fail("re-parent categories", reErr);
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) {
    if (String((error as { code?: string }).code) === "23503") {
      throw new Error("category still has products and cannot be deleted");
    }
    fail("delete category", error);
  }
}

/* ---------- Orders ---------- */

function mapOrderLine(
  l: Row,
  products: Map<string, string>,
  variants: Map<string, string>,
): OrderLine {
  const pid = strOrNull(l.product_id);
  const vid = strOrNull(l.variant_id);
  return {
    id: str(l.id),
    productName: pid ? (products.get(pid) ?? "—") : "—",
    variantName: vid ? (variants.get(vid) ?? null) : null,
    qty: num(l.qty, 1),
    unitPrice: num(l.unit_price),
  };
}

export async function getOrders(tenantId: string): Promise<Order[]> {
  const sb = getSupabase();
  const { data: oData, error: oErr } = await sb
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (oErr) fail("load orders", oErr);
  const orders = rowsOf(oData);
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => str(o.id));
  const [{ data: lData, error: lErr }, { data: payData, error: payErr }] = await Promise.all([
    sb.from("order_lines").select("*").in("order_id", orderIds),
    sb.from("payments").select("order_id,method,created_at").in("order_id", orderIds).order("created_at"),
  ]);
  if (lErr) fail("load order lines", lErr);
  if (payErr) fail("load payments", payErr);

  const lines = rowsOf(lData);
  const productIds = [...new Set(lines.map((l) => strOrNull(l.product_id)).filter((x): x is string => !!x))];
  const variantIds = [...new Set(lines.map((l) => strOrNull(l.variant_id)).filter((x): x is string => !!x))];
  const [pRes, vRes] = await Promise.all([
    productIds.length > 0
      ? sb.from("products").select("id,name").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length > 0
      ? sb.from("variants").select("id,name").in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pRes.error) fail("load line products", pRes.error);
  if (vRes.error) fail("load line variants", vRes.error);
  const productNames = new Map(rowsOf(pRes.data).map((p) => [str(p.id), str(p.name)]));
  const variantNames = new Map(rowsOf(vRes.data).map((v) => [str(v.id), str(v.name)]));

  const linesByOrder = new Map<string, OrderLine[]>();
  for (const l of lines) {
    const oid = str(l.order_id);
    const list = linesByOrder.get(oid) ?? [];
    list.push(mapOrderLine(l, productNames, variantNames));
    linesByOrder.set(oid, list);
  }
  const payByOrder = new Map<string, PaymentMethod>();
  for (const p of rowsOf(payData)) {
    const oid = str(p.order_id);
    if (!payByOrder.has(oid)) {
      const m = asPaymentMethod(p.method);
      if (m) payByOrder.set(oid, m);
    }
  }

  return orders.map((o) => ({
    id: str(o.id),
    tenantId: str(o.tenant_id),
    orderNumber: str(o.order_number),
    status: asOrderStatus(o.status),
    type: asOrderType(o.type),
    waiterName: strOrNull(o.waiter_name),
    totalGross: num(o.total_gross),
    discountAmount: num(o.discount_amount),
    paymentMethod: payByOrder.get(str(o.id)) ?? null,
    createdAt: str(o.created_at),
    lines: linesByOrder.get(str(o.id)) ?? [],
  }));
}

export async function getOnlineOrders(tenantId: string): Promise<OnlineOrder[]> {
  const sb = getSupabase();
  const { data: oData, error: oErr } = await sb
    .from("online_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (oErr) fail("load online orders", oErr);
  const orders = rowsOf(oData);
  if (orders.length === 0) return [];

  const { data: iData, error: iErr } = await sb
    .from("online_order_items")
    .select("*")
    .in(
      "order_id",
      orders.map((o) => str(o.id)),
    );
  if (iErr) fail("load online order items", iErr);

  const itemsByOrder = new Map<string, OnlineOrder["items"]>();
  for (const i of rowsOf(iData)) {
    const oid = str(i.order_id);
    const list = itemsByOrder.get(oid) ?? [];
    list.push({
      id: str(i.id),
      productName: str(i.product_name, "—"),
      variantName: strOrNull(i.variant_name),
      qty: num(i.quantity, 1),
      unitPrice: num(i.unit_price),
    });
    itemsByOrder.set(oid, list);
  }

  return orders.map((o) => ({
    id: str(o.id),
    tenantId: str(o.tenant_id),
    orderNumber: str(o.order_number),
    customerName: str(o.customer_name, "—"),
    customerPhone: str(o.customer_phone),
    wilaya: str(o.shipping_wilaya),
    commune: str(o.shipping_commune),
    address: strOrNull(o.shipping_address),
    shippingStatus: asShippingStatus(o.shipping_status),
    paymentStatus: asPaymentStatus(o.payment_status),
    paymentMethod: asPaymentMethod(o.payment_method) ?? "cash",
    subtotal: num(o.subtotal),
    deliveryFee: num(o.delivery_fee != null ? o.delivery_fee : o.shipping_cost),
    total: num(o.total),
    trackingNumber: strOrNull(o.tracking_number),
    note: strOrNull(o.notes) ?? strOrNull(o.special_instructions),
    createdAt: str(o.created_at),
    items: itemsByOrder.get(str(o.id)) ?? [],
  }));
}

export async function updateOnlineOrder(
  id: string,
  patch: { shippingStatus?: ShippingStatus; trackingNumber?: string | null },
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.shippingStatus !== undefined) row.shipping_status = patch.shippingStatus;
  if (patch.trackingNumber !== undefined)
    row.tracking_number = patch.trackingNumber?.trim() || null;
  const { error } = await sb.from("online_orders").update(row).eq("id", id);
  if (error) fail("update online order", error);
}

/* ---------- Dashboard / reports (live views) ---------- */

function dayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function getDashboardSummary(tenantId: string): Promise<DashboardSummary> {
  const sb = getSupabase();
  const [{ data: dData, error: dErr }, { data: aData, error: aErr }] = await Promise.all([
    sb.from("v_daily_sales").select("*").eq("tenant_id", tenantId).gte("date", dayKey(1)),
    sb.from("orders").select("id").eq("tenant_id", tenantId).in("status", ["confirmed", "preparing", "ready"]),
  ]);
  if (dErr) fail("load daily sales", dErr);
  if (aErr) fail("load active orders", aErr);

  const byDate = new Map(rowsOf(dData).map((r) => [str(r.date).slice(0, 10), r]));
  const today = byDate.get(dayKey(0));
  const yesterday = byDate.get(dayKey(1));
  const revenueToday = num(today?.completed_revenue);
  const revenueYesterday = num(yesterday?.completed_revenue);
  const ordersToday = num(today?.order_count);
  const yOrders = num(yesterday?.order_count);
  const completedToday = num(today?.completed_count);

  return {
    revenueToday,
    revenueDelta:
      revenueYesterday > 0
        ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
        : 0,
    ordersToday,
    ordersDelta: ordersToday - yOrders,
    avgOrderValue: completedToday > 0 ? Math.round(revenueToday / completedToday) : 0,
    completionRate:
      ordersToday > 0 ? Math.round((completedToday / ordersToday) * 100) : 100,
    activeOrders: Array.isArray(aData) ? aData.length : 0,
    lowStockCount: 0,
  };
}

export async function getHourlySales(tenantId: string): Promise<HourlySales[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("v_hourly_sales")
    .select("hour,order_count,revenue")
    .eq("tenant_id", tenantId)
    .gte("date", dayKey(30));
  if (error) fail("load hourly sales", error);
  const buckets = new Map<number, { orderCount: number; revenue: number }>();
  for (const r of rowsOf(data)) {
    const h = num(r.hour);
    const b = buckets.get(h) ?? { orderCount: 0, revenue: 0 };
    b.orderCount += num(r.order_count);
    b.revenue += num(r.revenue);
    buckets.set(h, b);
  }
  return [...buckets.entries()]
    .map(([hour, v]) => ({ hour, ...v }))
    .sort((a, b) => a.hour - b.hour);
}

export async function getDailySales(tenantId: string, days = 7): Promise<DailySales[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("v_daily_sales")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("date", dayKey(days - 1))
    .order("date", { ascending: true });
  if (error) fail("load daily sales", error);
  const byDate = new Map(rowsOf(data).map((r) => [str(r.date).slice(0, 10), r]));
  const out: DailySales[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(i);
    const r = byDate.get(key);
    const completed = num(r?.completed_count);
    const revenue = num(r?.completed_revenue);
    out.push({
      date: new Date(`${key}T00:00:00Z`).toISOString(),
      orderCount: num(r?.order_count),
      completedCount: completed,
      totalRevenue: revenue,
      completedRevenue: revenue,
      avgOrderValue: completed > 0 ? Math.round(revenue / completed) : 0,
    });
  }
  return out;
}

export async function getTopProducts(
  tenantId: string,
  limit = 5,
): Promise<ProductPerformance[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("v_product_performance")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("total_revenue", { ascending: false })
    .limit(limit);
  if (error) fail("load top products", error);
  return rowsOf(data)
    .filter((r) => num(r.total_quantity) > 0)
    .map((r) => ({
      productId: str(r.product_id),
      name: str(r.name),
      categoryName: strOrNull(r.category_name),
      timesSold: num(r.times_sold),
      totalQuantity: num(r.total_quantity),
      totalRevenue: num(r.total_revenue),
    }));
}

export async function getPaymentBreakdown(tenantId: string): Promise<PaymentBreakdown[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("v_payment_breakdown")
    .select("method,payment_count,total_amount")
    .eq("tenant_id", tenantId);
  if (error) fail("load payment breakdown", error);
  const agg = new Map<PaymentMethod, PaymentBreakdown>();
  for (const r of rowsOf(data)) {
    const m = asPaymentMethod(r.method);
    if (!m) continue;
    const row = agg.get(m) ?? { method: m, paymentCount: 0, totalAmount: 0 };
    row.paymentCount += num(r.payment_count);
    row.totalAmount += num(r.total_amount);
    agg.set(m, row);
  }
  return [...agg.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}

/* ---------- Tenant settings ---------- */

export interface TenantSettingsInput {
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
}

export async function updateTenantSettings(
  id: string,
  s: TenantSettingsInput,
): Promise<void> {
  const sb = getSupabase();
  const { data: current, error: cErr } = await sb
    .from("tenants")
    .select("config")
    .eq("id", id)
    .maybeSingle();
  if (cErr) fail("load tenant config", cErr);
  const row = oneOf(current);
  const config =
    row?.config && typeof row.config === "object"
      ? { ...(row.config as Record<string, unknown>) }
      : {};
  const brandRaw =
    config.brand && typeof config.brand === "object"
      ? { ...(config.brand as Record<string, unknown>) }
      : {};
  const mergeLang = (prev: unknown, fr: string) => ({
    ...(prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {}),
    fr,
  });
  config.brand = {
    ...brandRaw,
    tagline: mergeLang(brandRaw.tagline, s.tagline),
    siteTitle: mergeLang(brandRaw.siteTitle, s.siteTitle),
    metaDescription: mergeLang(brandRaw.metaDescription, s.metaDescription),
  };

  const toNum = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const { error } = await sb
    .from("tenants")
    .update({
      name: s.name.trim(),
      business_name: s.businessName.trim(),
      business_address: s.businessAddress.trim() || null,
      owner_phone: s.ownerPhone.trim() || null,
      online_ordering_enabled: s.onlineOrdering,
      delivery_enabled: s.delivery,
      pickup_enabled: s.pickup,
      dine_in_enabled: s.dineIn,
      reservations_enabled: s.reservations,
      auto_accept_orders: s.autoAccept,
      min_order_amount: s.minOrder,
      estimated_prep_time: s.prepTime,
      storefront_enabled: s.storefrontEnabled,
      storefront_slug: s.storefrontSlug.trim() || null,
      storefront_description: s.storefrontDescription.trim() || null,
      restaurant_latitude: toNum(s.latitude),
      restaurant_longitude: toNum(s.longitude),
      config,
    })
    .eq("id", id);
  if (error) fail("save business settings", error);
}

/* ---------- CSV export ---------- */

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
