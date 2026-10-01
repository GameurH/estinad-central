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
  AttributeKind,
  BrandConfig,
  Category,
  CategoryTranslation,
  DailySales,
  DashboardSummary,
  HourlySales,
  HeroSection,
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
  ProductAttribute,
  ProductAttributeValue,
  ProductMedia,
  ProductPerformance,
  VariantTranslation,
  MediaAsset,
  ProductTranslation,
  ShippingStatus,
  ShippingMethodType,
  ShippingMethod,
  Commune,
  DeliveryZone,
  Wilaya,
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
  // Display image: the mirrored gallery first (`images[0]` is the primary media
  // URL), then `products.image` only when it really is a URL — the POS sync
  // stores a bare filename there for some products.
  const legacyImage = strOrNull(r.image);
  const legacyImageIsUrl = legacyImage !== null && /^(https?:\/\/|\/)/.test(legacyImage);
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
    image: images[0] ?? (legacyImageIsUrl ? legacyImage : null),
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

  const variants = await attachVariantTranslations(rowsOf(vData).map(mapVariant));

  return { ...product, variants, translations };
}

/**
 * Loads `variant_translations` for these variants, seeds the synchronous name
 * cache (`getVariantName`) and attaches the rows to each variant.
 */
async function attachVariantTranslations(variants: Variant[]): Promise<Variant[]> {
  if (variants.length === 0) return variants;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("variant_translations")
    .select("variant_id,language_code,name")
    .in("variant_id", variants.map((v) => v.id));
  if (error) fail("load variant translations", error);

  const byVariant = new Map<string, VariantTranslation[]>();
  for (const t of rowsOf(data)) {
    const translation = {
      variantId: str(t.variant_id),
      languageCode: asLangCode(t.language_code),
      name: str(t.name),
    };
    putTr("variant", translation.variantId, str(t.language_code), translation.name);
    if (!translation.languageCode) continue;
    const list = byVariant.get(translation.variantId) ?? [];
    list.push({ ...translation, languageCode: translation.languageCode });
    byVariant.set(translation.variantId, list);
  }
  for (const v of variants) v.translations = byVariant.get(v.id) ?? [];
  return variants;
}

/** One product's variants with their translations — the variant editor's source. */
export async function getVariants(productId: string): Promise<Variant[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("variants")
    .select("*")
    .eq("product_id", productId)
    .order("name");
  if (error) fail("load variants", error);
  return attachVariantTranslations(rowsOf(data).map(mapVariant));
}

function mapVariant(r: Row): Variant {
  const rawAttributes = r.attribute_values;
  const attributeValues: Record<string, string> = {};
  if (rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)) {
    for (const [key, value] of Object.entries(rawAttributes as Record<string, unknown>)) {
      if (typeof value === "string" && value) attributeValues[key] = value;
    }
  }
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    productId: str(r.product_id),
    name: str(r.name),
    priceMod: num(r.price_mod),
    sku: strOrNull(r.sku),
    barcode: strOrNull(r.barcode),
    image: strOrNull(r.image),
    isAvailable: r.is_available == null ? true : bool(r.is_available, true),
    trackStock: bool(r.track_stock),
    weight: r.weight == null ? null : num(r.weight),
    weightUnit: strOrNull(r.weight_unit),
    color: strOrNull(r.color),
    colorHex: strOrNull(r.color_hex),
    attributeValues,
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
  const translations = new Map<string, CategoryTranslation[]>();
  if (ids.length > 0) {
    const { data: tData, error: tErr } = await sb
      .from("category_translations")
      .select("category_id,language_code,name")
      .in("category_id", ids);
    if (tErr) fail("load category translations", tErr);
    for (const c of cats) seedBase("category", str(c.id), str(c.name));
    for (const t of rowsOf(tData)) {
      const categoryId = str(t.category_id);
      const languageCode = asLangCode(t.language_code);
      putTr("category", categoryId, str(t.language_code), str(t.name));
      if (!languageCode) continue;
      const list = translations.get(categoryId) ?? [];
      list.push({ categoryId, languageCode, name: str(t.name) });
      translations.set(categoryId, list);
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
    image: strOrNull(c.image),
    translations: translations.get(str(c.id)) ?? [],
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
 * Maps the `language_code` values a translation table already holds for one row.
 *
 * Live data uses `fr` / `ar` / `en` but the schema allows aliases (`ara`,
 * `ar-SA`…), so writes must target the stored value: inserting a second row for
 * the same language would violate the `(owner, language_code)` unique key.
 */
async function storedLanguageCodes(
  table: "product_translations" | "category_translations" | "variant_translations",
  column: "product_id" | "category_id" | "variant_id",
  id: string,
): Promise<Map<LangCode, string>> {
  const sb = getSupabase();
  const { data, error } = await sb.from(table).select("language_code").eq(column, id);
  if (error) fail(`load ${table}`, error);
  const stored = new Map<LangCode, string>();
  for (const r of rowsOf(data)) {
    const code = asLangCode(r.language_code);
    const raw = str(r.language_code);
    if (code && raw) stored.set(code, raw);
  }
  return stored;
}

export interface ProductTranslationInput {
  languageCode: LangCode;
  /** Blank field → the stored name falls back to the primary name. */
  name: string | null;
  longDescription: string | null;
}

/**
 * Upserts per-language storefront copy in `product_translations`.
 *
 * `name` and `long_description` are written; `short_description` is left to the
 * POS sync. `name` is NOT NULL, so a blank field falls back to the primary name.
 * Rows are created only when they carry real content — a name that differs from
 * the primary name, or a description — and clearing a description writes NULL
 * rather than orphaning an empty row.
 */
export async function saveProductTranslations(
  productId: string,
  baseName: string,
  entries: ProductTranslationInput[],
): Promise<void> {
  if (entries.length === 0) return;
  const sb = getSupabase();
  const stored = await storedLanguageCodes("product_translations", "product_id", productId);
  const base = baseName.trim() || "—";
  const now = new Date().toISOString();

  for (const entry of entries) {
    const name = entry.name?.trim() || null;
    const longDescription = entry.longDescription?.trim() || null;
    const raw = stored.get(entry.languageCode);

    if (raw) {
      const patch: Record<string, unknown> = {
        long_description: longDescription,
        updated_at: now,
      };
      // `name` is NOT NULL, so a blank field stores the primary name instead.
      patch.name = name ?? base;
      const { error } = await sb
        .from("product_translations")
        .update(patch)
        .eq("product_id", productId)
        .eq("language_code", raw);
      if (error) fail("save product translation", error);
      continue;
    }

    if (!((name !== null && name !== base) || longDescription !== null)) continue;
    const { error } = await sb.from("product_translations").insert({
      product_id: productId,
      language_code: entry.languageCode,
      name: name ?? base,
      long_description: longDescription,
    });
    if (error) fail("save product translation", error);
  }
}

export interface CategoryTranslationInput {
  languageCode: LangCode;
  /** Blank field → the stored name falls back to the base name. */
  name: string | null;
}

/**
 * Upserts per-language names for any table shaped `(owner_id, language_code, name)`
 * — categories and variants today, products later.
 *
 * A blank field stores the base name (`name` is NOT NULL in these tables), and a
 * row is only created for a name that actually differs from the base.
 */
async function upsertNameTranslations(
  table: "category_translations" | "variant_translations",
  column: "category_id" | "variant_id",
  ownerId: string,
  baseName: string,
  entries: CategoryTranslationInput[],
  label: string,
): Promise<void> {
  if (entries.length === 0) return;
  const sb = getSupabase();
  const stored = await storedLanguageCodes(table, column, ownerId);
  const base = baseName.trim() || "—";
  const now = new Date().toISOString();

  for (const entry of entries) {
    const name = entry.name?.trim() || null;
    const raw = stored.get(entry.languageCode);

    if (raw) {
      const { error } = await sb
        .from(table)
        .update({ updated_at: now, name: name ?? base })
        .eq(column, ownerId)
        .eq("language_code", raw);
      if (error) fail(`save ${label} translation`, error);
      continue;
    }

    if (name === null || name === base) continue;
    const { error } = await sb.from(table).insert({
      [column]: ownerId,
      language_code: entry.languageCode,
      name,
    });
    if (error) fail(`save ${label} translation`, error);
  }
}

/**
 * Upserts per-language category names in `category_translations`, with the same
 * rules as products: a blank field stores the base name (`name` is NOT NULL),
 * and a row is only created for a name that differs from it.
 */
export async function saveCategoryTranslations(
  categoryId: string,
  baseName: string,
  entries: CategoryTranslationInput[],
): Promise<void> {
  await upsertNameTranslations(
    "category_translations",
    "category_id",
    categoryId,
    baseName,
    entries,
    "category",
  );
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

/**
 * Bulk availability update — one UPDATE ... in (ids), tenant-scoped so the
 * caller cannot touch another tenant's rows even if the RLS guard rail slips.
 */
export async function bulkSetProductsAvailability(
  tenantId: string,
  ids: string[],
  isAvailable: boolean,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("products")
    .update({ is_available: isAvailable })
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) fail("bulk set product availability", error);
}

/**
 * Bulk category move. Callers pass only ids that belong to the tenant; the
 * extra `tenant_id` clause turns that assumption into a guard rail.
 */
export async function bulkMoveProductsToCategory(
  tenantId: string,
  ids: string[],
  categoryId: string | null,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("products")
    .update({ category_id: categoryId })
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) fail("bulk move products to category", error);
}

/**
 * Bulk delete with per-item result: one blocked id (product used by an order —
 * FK 23503) must not hide the fate of the others, which a single statement
 * delete would (it fails all-or-nothing). Blocked ids come back so the caller
 * can name them.
 */
export async function bulkDeleteProducts(
  tenantId: string,
  ids: string[],
): Promise<{ deleted: string[]; blocked: string[] }> {
  const sb = getSupabase();
  const deleted: string[] = [];
  const blocked: string[] = [];

  // Independent deletes in parallel; results are order-independent.
  await Promise.all(
    ids.map(async (id) => {
      const { error } = await sb
        .from("products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) blocked.push(id);
      else deleted.push(id);
    }),
  );
  return { deleted, blocked };
}

/** Fields central can write on a variant (names map to the DB columns). */
export type VariantPatch = Partial<{
  name: string;
  priceMod: number;
  sku: string | null;
  barcode: string | null;
  image: string | null;
  isAvailable: boolean;
  trackStock: boolean;
  weight: number | null;
  weightUnit: string | null;
  color: string | null;
  colorHex: string | null;
  /** Option values, e.g. `{ "Poids": "500g" }`. */
  attributeValues: Record<string, string>;
}>;

function variantPatchRow(patch: VariantPatch): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.priceMod !== undefined) row.price_mod = patch.priceMod;
  if (patch.sku !== undefined) row.sku = patch.sku?.trim() || null;
  if (patch.barcode !== undefined) row.barcode = patch.barcode?.trim() || null;
  if (patch.image !== undefined) row.image = patch.image?.trim() || null;
  if (patch.isAvailable !== undefined) row.is_available = patch.isAvailable;
  if (patch.trackStock !== undefined) row.track_stock = patch.trackStock;
  if (patch.weight !== undefined) row.weight = patch.weight;
  if (patch.weightUnit !== undefined) row.weight_unit = patch.weightUnit?.trim() || null;
  if (patch.color !== undefined) row.color = patch.color?.trim() || null;
  if (patch.colorHex !== undefined) row.color_hex = patch.colorHex?.trim() || null;
  if (patch.attributeValues !== undefined) row.attribute_values = patch.attributeValues;
  return row;
}

/** Case-insensitive name check, so the 18 existing duplicates don't multiply. */
async function variantNameExists(
  productId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("variants")
    .select("id,name")
    .eq("product_id", productId);
  if (error) fail("check variant name", error);
  const wanted = name.trim().toLowerCase();
  return rowsOf(data).some(
    (r) => str(r.id) !== exceptId && str(r.name).trim().toLowerCase() === wanted,
  );
}

/**
 * Stable identity for "the same variant": its option values when it has any,
 * else its name. Used so generating a matrix twice is a no-op.
 */
function variantSignature(name: string, attributeValues: unknown): string {
  const entries =
    attributeValues && typeof attributeValues === "object"
      ? Object.entries(attributeValues as Record<string, unknown>)
          .filter(([, value]) => typeof value === "string" && value)
          .sort(([a], [b]) => a.localeCompare(b))
      : [];
  if (entries.length === 0) return `name:${name.trim().toLowerCase()}`;
  return `attrs:${entries.map(([k, v]) => `${k}=${String(v)}`).join("|").toLowerCase()}`;
}

export async function createVariant(input: {
  tenantId: string;
  productId: string;
  name: string;
  priceMod: number;
} & VariantPatch): Promise<Variant> {
  const sb = getSupabase();
  const name = input.name.trim();
  if (!name) throw new Error("a variant needs a name");
  if (await variantNameExists(input.productId, name)) {
    throw new Error(`a variant named “${name}” already exists on this product`);
  }
  const { data, error } = await sb
    .from("variants")
    .insert({
      tenant_id: input.tenantId,
      product_id: input.productId,
      ...variantPatchRow({ ...input, name, isAvailable: input.isAvailable ?? true }),
    })
    .select("*")
    .single();
  if (error) fail("create variant", error);
  const row = oneOf(data);
  if (!row) throw new Error("create variant: no row returned");
  return mapVariant(row);
}

export async function updateVariant(id: string, patch: VariantPatch): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("variants").update(variantPatchRow(patch)).eq("id", id);
  if (error) fail("update variant", error);
}

/** One patch across many variants — bulk price, availability or options. */
export async function bulkUpdateVariants(ids: string[], patch: VariantPatch): Promise<void> {
  if (ids.length === 0) return;
  const sb = getSupabase();
  const { error } = await sb.from("variants").update(variantPatchRow(patch)).in("id", ids);
  if (error) fail("update variants", error);
}

/**
 * Upserts per-language variant names in `variant_translations`.
 *
 * Same rules as products and categories: the base name stays on the variant, a
 * blank field stores the base name (`name` is NOT NULL there), and a row is only
 * created for a name that actually differs.
 */
export async function saveVariantTranslations(
  variantId: string,
  baseName: string,
  entries: { languageCode: LangCode; name: string | null }[],
): Promise<void> {
  await upsertNameTranslations(
    "variant_translations",
    "variant_id",
    variantId,
    baseName,
    entries,
    "variant",
  );
}

/**
 * Creates variants for a set of option combinations, skipping any that already
 * exist (matched on option values, or on the name for flat variants).
 *
 * Inserts directly rather than through `createVariant`: the name guard would
 * reject a combination whose name already exists, which is exactly the case
 * this is meant to fill in.
 */
export async function generateVariants(input: {
  tenantId: string;
  productId: string;
  rows: { name: string; attributeValues: Record<string, string>; priceMod?: number }[];
}): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("variants")
    .select("name,attribute_values")
    .eq("product_id", input.productId);
  if (error) fail("load variants", error);

  const existing = new Set(
    rowsOf(data).map((r) => variantSignature(str(r.name), r.attribute_values)),
  );

  let created = 0;
  for (const row of input.rows) {
    const signature = variantSignature(row.name, row.attributeValues);
    if (existing.has(signature)) continue;
    const { error: insertError } = await sb.from("variants").insert({
      tenant_id: input.tenantId,
      product_id: input.productId,
      ...variantPatchRow({
        name: row.name,
        priceMod: row.priceMod ?? 0,
        isAvailable: true,
        attributeValues: row.attributeValues,
      }),
    });
    if (insertError) fail("generate variants", insertError);
    existing.add(signature);
    created += 1;
  }
  return created;
}

/* ---------- Tenant option vocabulary (variant matrices) ---------- */

/**
 * The tenant's options and their values.
 *
 * `product_attributes` has no product column, so options are shared across
 * every product — a product's matrix is the subset its variants use.
 * `product_attributes.values` (jsonb) is left alone: the normalised
 * `product_attribute_values` table is the source of truth here.
 */
export async function getProductAttributes(tenantId: string): Promise<ProductAttribute[]> {
  const sb = getSupabase();
  const [attributeRes, valueRes] = await Promise.all([
    sb
      .from("product_attributes")
      .select("id,tenant_id,name,type,sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    sb
      .from("product_attribute_values")
      .select("id,attribute_id,value,color_hex,sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
  ]);
  if (attributeRes.error) fail("load product attributes", attributeRes.error);
  if (valueRes.error) fail("load attribute values", valueRes.error);

  const valuesByAttribute = new Map<string, ProductAttributeValue[]>();
  for (const v of rowsOf(valueRes.data)) {
    const attributeId = str(v.attribute_id);
    const list = valuesByAttribute.get(attributeId) ?? [];
    list.push({
      id: str(v.id),
      attributeId,
      value: str(v.value),
      colorHex: strOrNull(v.color_hex),
    });
    valuesByAttribute.set(attributeId, list);
  }

  return rowsOf(attributeRes.data).map((a) => ({
    id: str(a.id),
    tenantId: str(a.tenant_id),
    name: str(a.name),
    type: str(a.type) === "color" ? "color" : "select",
    values: valuesByAttribute.get(str(a.id)) ?? [],
  }));
}

export async function createProductAttribute(input: {
  tenantId: string;
  name: string;
  type: AttributeKind;
}): Promise<ProductAttribute> {
  const sb = getSupabase();
  const name = input.name.trim();
  if (!name) throw new Error("an option needs a name");
  const { data, error } = await sb
    .from("product_attributes")
    .insert({ tenant_id: input.tenantId, name, type: input.type, values: [] })
    .select("id,tenant_id,name,type")
    .single();
  if (error) fail("create option", error);
  const row = oneOf(data);
  if (!row) throw new Error("create option: no row returned");
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id),
    name: str(row.name),
    type: str(row.type) === "color" ? "color" : "select",
    values: [],
  };
}

export async function createAttributeValue(input: {
  tenantId: string;
  attributeId: string;
  value: string;
  colorHex?: string | null;
}): Promise<ProductAttributeValue> {
  const sb = getSupabase();
  const value = input.value.trim();
  if (!value) throw new Error("an option value needs a name");
  const { data, error } = await sb
    .from("product_attribute_values")
    .insert({
      tenant_id: input.tenantId,
      attribute_id: input.attributeId,
      value,
      color_hex: input.colorHex?.trim() || null,
    })
    .select("id,attribute_id,value,color_hex")
    .single();
  if (error) fail("create option value", error);
  const row = oneOf(data);
  if (!row) throw new Error("create option value: no row returned");
  return {
    id: str(row.id),
    attributeId: str(row.attribute_id),
    value: str(row.value),
    colorHex: strOrNull(row.color_hex),
  };
}

export async function deleteAttributeValue(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("product_attribute_values").delete().eq("id", id);
  if (error) fail("delete option value", error);
}

export async function deleteProductAttribute(id: string): Promise<void> {
  const sb = getSupabase();
  // Values first: the child FK is NO ACTION, like the other child tables here.
  const { error: valueError } = await sb
    .from("product_attribute_values")
    .delete()
    .eq("attribute_id", id);
  if (valueError) fail("delete option values", valueError);
  const { error } = await sb.from("product_attributes").delete().eq("id", id);
  if (error) fail("delete option", error);
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
  /** Public URL for the storefront category tile. */
  image: string | null;
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
      image: input.image?.trim() || null,
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
    image: strOrNull(row.image),
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
  if (patch.image !== undefined) row.image = patch.image?.trim() || null;
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

/* ---------- Media library ---------- */

const MEDIA_ASSET_COLUMNS =
  "id,tenant_id,storage_bucket,storage_path,alt_text,folder,tags,is_favorite,created_at,updated_at";

function mapMediaAsset(r: Row): MediaAsset {
  const storageBucket = str(r.storage_bucket, MEDIA_BUCKET);
  const storagePath = str(r.storage_path);
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    storageBucket,
    storagePath,
    alt: strOrNull(r.alt_text),
    folder: str(r.folder),
    tags: Array.isArray(r.tags)
      ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [],
    isFavorite: bool(r.is_favorite),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    url: storagePath
      ? getSupabase().storage.from(storageBucket).getPublicUrl(storagePath).data.publicUrl
      : "",
  };
}

export interface MediaAssetFilter {
  /** Exact folder path; `''` is the library root. Omit for every folder. */
  folder?: string;
  tag?: string;
  favoritesOnly?: boolean;
  /** Case-insensitive substring of the storage path (i.e. the filename). */
  search?: string;
  limit?: number;
}

export async function getMediaAssets(
  tenantId: string,
  filter: MediaAssetFilter = {},
): Promise<MediaAsset[]> {
  const sb = getSupabase();
  let query = sb
    .from("media_assets")
    .select(MEDIA_ASSET_COLUMNS)
    .eq("tenant_id", tenantId);

  if (filter.folder !== undefined) query = query.eq("folder", filter.folder);
  if (filter.favoritesOnly) query = query.eq("is_favorite", true);
  if (filter.tag) query = query.contains("tags", [filter.tag]);
  if (filter.search) query = query.ilike("storage_path", `%${filter.search}%`);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (error) fail("load media library", error);
  return rowsOf(data).map(mapMediaAsset);
}

/** Folder paths in use, sorted — the library sidebar. */
export async function listMediaFolders(tenantId: string): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("media_assets")
    .select("folder")
    .eq("tenant_id", tenantId);
  if (error) fail("load media folders", error);
  return Array.from(new Set(rowsOf(data).map((r) => str(r.folder)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Tag vocabulary in use, sorted. */
export async function listMediaTags(tenantId: string): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("media_assets").select("tags").eq("tenant_id", tenantId);
  if (error) fail("load media tags", error);
  const tags = new Set<string>();
  for (const row of rowsOf(data)) {
    if (!Array.isArray(row.tags)) continue;
    for (const tag of row.tags as unknown[]) {
      if (typeof tag === "string" && tag) tags.add(tag);
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

/**
 * Uploads a file into the library (`<tenant>/library/<folder>/…`) and indexes
 * it. Nothing is attached to a product here — callers attach afterwards, which
 * is what stops uploads from becoming unreachable objects.
 */
export async function uploadMediaAsset(input: {
  tenantId: string;
  file: File;
  folder?: string;
  alt?: string | null;
  tags?: string[];
}): Promise<MediaAsset> {
  const sb = getSupabase();
  const folder = (input.folder ?? "").trim().replace(/^\/+|\/+$/g, "");
  const uploaded = await uploadTenantImage({
    tenantId: input.tenantId,
    folder: folder ? `library/${folder}` : "library",
    file: input.file,
  });

  const { data, error } = await sb
    .from("media_assets")
    .insert({
      tenant_id: input.tenantId,
      storage_bucket: uploaded.storageBucket,
      storage_path: uploaded.storagePath,
      alt_text: input.alt?.trim() || null,
      folder,
      tags: input.tags ?? [],
    })
    .select(MEDIA_ASSET_COLUMNS)
    .single();

  if (error) {
    await sb.storage.from(uploaded.storageBucket).remove([uploaded.storagePath]);
    fail("index uploaded image", error);
  }
  const row = oneOf(data);
  if (!row) throw new Error("index uploaded image: no row returned");
  return mapMediaAsset(row);
}

/** Organises one asset: alt text, folder, tags, favourite. */
export async function updateMediaAsset(
  id: string,
  patch: {
    altText?: string | null;
    folder?: string;
    tags?: string[];
    isFavorite?: boolean;
  },
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.altText !== undefined) row.alt_text = patch.altText?.trim() || null;
  if (patch.folder !== undefined) row.folder = patch.folder.trim().replace(/^\/+|\/+$/g, "");
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.isFavorite !== undefined) row.is_favorite = patch.isFavorite;
  const { error } = await sb.from("media_assets").update(row).eq("id", id);
  if (error) fail("update media asset", error);
}

/**
 * Removes an asset from the library.
 *
 * If a product gallery still points at the object the file is kept and only the
 * index row goes — deleting the bytes would blank a live product photo. Returns
 * whether the object itself was removed so the UI can say which happened.
 */
export async function deleteMediaAsset(
  asset: MediaAsset,
): Promise<{ objectRemoved: boolean }> {
  const sb = getSupabase();
  const { count, error: countError } = await sb
    .from("product_media")
    .select("id", { count: "exact", head: true })
    .eq("storage_bucket", asset.storageBucket)
    .eq("storage_path", asset.storagePath);
  if (countError) fail("check media usage", countError);

  const attached = (count ?? 0) > 0;
  if (!attached) {
    const { error: removeError } = await sb.storage
      .from(asset.storageBucket)
      .remove([asset.storagePath]);
    if (removeError) fail("remove image file", removeError);
  }

  const { error } = await sb.from("media_assets").delete().eq("id", asset.id);
  if (error) fail("remove media asset", error);
  return { objectRemoved: !attached };
}

/* ---------- Product media ---------- */

const MEDIA_BUCKET = "product-media";

/** Mirrors the live `product-media` bucket config (5 MB, image allow-list). */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MEDIA_COLUMNS =
  "id,product_id,storage_bucket,storage_path,asset_id,alt_text,is_primary,position,created_at";

function mapProductMedia(r: Row): ProductMedia {
  const storageBucket = str(r.storage_bucket, MEDIA_BUCKET);
  const storagePath = str(r.storage_path);
  return {
    id: str(r.id),
    productId: str(r.product_id),
    storageBucket,
    storagePath,
    assetId: strOrNull(r.asset_id),
    alt: strOrNull(r.alt_text),
    isPrimary: bool(r.is_primary),
    position: num(r.position),
    createdAt: str(r.created_at),
    url: storagePath
      ? getSupabase().storage.from(storageBucket).getPublicUrl(storagePath).data.publicUrl
      : "",
  };
}

/** Same order the storefront uses: primary first, then position, then age. */
function orderMedia(media: ProductMedia[]): ProductMedia[] {
  return media.slice().sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getProductMedia(productId: string): Promise<ProductMedia[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("product_media")
    .select(MEDIA_COLUMNS)
    .eq("product_id", productId);
  if (error) fail("load product media", error);
  return orderMedia(rowsOf(data).map(mapProductMedia));
}

/** Where one uploaded image landed, plus its public URL. */
export interface UploadedImage {
  storageBucket: string;
  storagePath: string;
  url: string;
}

/**
 * Uploads one image to `<tenant>/<folder>/…` and returns where it landed.
 *
 * The first path segment is what the Storage RLS policy checks, so it must be
 * the tenant id that also appears in `tenant_owners`. Shared by the product
 * gallery (folder = product id) and by single-image fields such as a category
 * tile (folder = `categories`); the caller decides whether a row is attached.
 */
export async function uploadTenantImage(input: {
  tenantId: string;
  folder: string;
  file: File;
}): Promise<UploadedImage> {
  const sb = getSupabase();
  const extension = MEDIA_EXTENSIONS[input.file.type] ?? "bin";
  const suffix = Math.random().toString(36).slice(2, 11);
  const storagePath = `${input.tenantId}/${input.folder}/${Date.now()}-${suffix}.${extension}`;

  const { error } = await sb.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (error) fail("upload image", error);

  return {
    storageBucket: MEDIA_BUCKET,
    storagePath,
    url: sb.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl,
  };
}

/** Public prefix of our own bucket — lets us tell our URLs from foreign ones. */
function mediaPublicPrefix(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${MEDIA_BUCKET}/`;
}

/**
 * Mirrors the gallery into `products.images`.
 *
 * The storefront renders `product_media` first and then *falls back* to
 * `products.images`, and other consumers read that array too. Without this,
 * removing a photo deletes the object while the legacy array keeps pointing at
 * it — a broken image on the product page.
 *
 * Only URLs inside our own bucket are rewritten: entries pointing at another
 * host are preserved untouched. `products.image` is deliberately left alone —
 * the POS sync writes a bare filename there for some products.
 */
async function syncProductImageMirror(productId: string): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("products")
    .select("images")
    .eq("id", productId)
    .maybeSingle();
  if (error) fail("load product images", error);

  const row = oneOf(data);
  const current = Array.isArray(row?.images)
    ? (row.images as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  const prefix = mediaPublicPrefix();
  const foreign = current.filter((url) => !url.startsWith(prefix));
  const gallery = (await getProductMedia(productId)).map((m) => m.url);
  const images = Array.from(new Set([...gallery, ...foreign]));

  const unchanged =
    images.length === current.length && images.every((url, i) => url === current[i]);
  if (unchanged) return;

  const { error: writeError } = await sb
    .from("products")
    .update({ images, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (writeError) fail("sync product images", writeError);
}

/**
 * Loads specific library assets (e.g. the ones a merchant just selected).
 */
export async function getMediaAssetsByIds(ids: string[]): Promise<MediaAsset[]> {
  if (ids.length === 0) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("media_assets")
    .select(MEDIA_ASSET_COLUMNS)
    .in("id", ids);
  if (error) fail("load media assets", error);
  return rowsOf(data).map(mapMediaAsset);
}

/**
 * Attaches library assets to a product's gallery.
 *
 * The gallery row keeps the object's bucket/path because that is what the
 * storefront reads, and adds `asset_id` so the library stays the single place
 * where folder/tags/favourite live. Assets already on the product are skipped
 * (the table is unique on bucket+path), so this is safe to call twice.
 */
export async function attachAssetsToProduct(input: {
  tenantId: string;
  productId: string;
  assetIds: string[];
}): Promise<number> {
  const sb = getSupabase();
  const assets = await getMediaAssetsByIds(input.assetIds);
  if (assets.length === 0) return 0;

  const existing = await getProductMedia(input.productId);
  const attachedPaths = new Set(existing.map((m) => `${m.storageBucket}|${m.storagePath}`));
  let position = existing.reduce((max, m) => Math.max(max, m.position), -1) + 1;
  let primaryTaken = existing.some((m) => m.isPrimary);
  let attached = 0;

  for (const asset of assets) {
    if (attachedPaths.has(`${asset.storageBucket}|${asset.storagePath}`)) continue;
    const { error } = await sb.from("product_media").insert({
      product_id: input.productId,
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      asset_id: asset.id,
      is_primary: !primaryTaken,
      position,
    });
    if (error) fail("attach image", error);
    position += 1;
    primaryTaken = true;
    attached += 1;
  }
  if (attached > 0) await syncProductImageMirror(input.productId);
  return attached;
}

/**
 * Uploads a photo into the library and attaches it to the product's gallery.
 *
 * The library row is created first, so the object is reachable even if the
 * attach fails — that is the whole point of indexing uploads. No compensating
 * delete is needed here, unlike a bare object upload.
 */
export async function uploadProductMedia(input: {
  tenantId: string;
  productId: string;
  file: File;
  alt?: string | null;
}): Promise<ProductMedia> {
  const sb = getSupabase();
  const asset = await uploadMediaAsset({
    tenantId: input.tenantId,
    file: input.file,
    alt: input.alt,
  });

  const existing = await getProductMedia(input.productId);
  const position = existing.reduce((max, m) => Math.max(max, m.position), -1) + 1;

  const { data, error } = await sb
    .from("product_media")
    .insert({
      product_id: input.productId,
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      asset_id: asset.id,
      is_primary: existing.length === 0,
      position,
    })
    .select(MEDIA_COLUMNS)
    .single();

  if (error) fail("attach photo", error);
  const row = oneOf(data);
  if (!row) throw new Error("attach photo: no row returned");
  await syncProductImageMirror(input.productId);
  return mapProductMedia(row);
}

/**
 * Removes the file and its row, then promotes a new primary if needed.
 *
 * The object may now be shared (one library asset can back several products),
 * so the bytes are only deleted when the last reference goes away.
 */
export async function deleteProductMedia(media: ProductMedia): Promise<void> {
  const sb = getSupabase();
  const { count, error: countError } = await sb
    .from("product_media")
    .select("id", { count: "exact", head: true })
    .eq("storage_bucket", media.storageBucket)
    .eq("storage_path", media.storagePath);
  if (countError) fail("check photo usage", countError);

  const { error } = await sb.from("product_media").delete().eq("id", media.id);
  if (error) fail("remove photo", error);

  if ((count ?? 0) <= 1) {
    const { error: removeError } = await sb.storage
      .from(media.storageBucket)
      .remove([media.storagePath]);
    if (removeError) fail("remove photo file", removeError);
    const { error: assetError } = await sb
      .from("media_assets")
      .delete()
      .eq("storage_bucket", media.storageBucket)
      .eq("storage_path", media.storagePath);
    if (assetError) fail("remove media asset", assetError);
  }

  if (media.isPrimary) {
    const remaining = await getProductMedia(media.productId);
    if (remaining.length > 0) {
      await setPrimaryProductMedia(media.productId, remaining[0].id);
    }
  }
  await syncProductImageMirror(media.productId);
}

/**
 * Marks one photo as primary. There is no DB constraint on `is_primary`, so the
 * previous primary is cleared first.
 */
export async function setPrimaryProductMedia(
  productId: string,
  mediaId: string,
): Promise<void> {
  const sb = getSupabase();
  const { error: clearError } = await sb
    .from("product_media")
    .update({ is_primary: false })
    .eq("product_id", productId)
    .eq("is_primary", true);
  if (clearError) fail("reset primary photo", clearError);

  const { error } = await sb
    .from("product_media")
    .update({ is_primary: true })
    .eq("id", mediaId)
    .eq("product_id", productId);
  if (error) fail("set primary photo", error);
  await syncProductImageMirror(productId);
}

/** Persists a new gallery order; `orderedIds` is the full list, first to last. */
export async function reorderProductMedia(
  productId: string,
  orderedIds: string[],
): Promise<void> {
  const sb = getSupabase();
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const { error } = await sb
        .from("product_media")
        .update({ position: index })
        .eq("id", id)
        .eq("product_id", productId);
      if (error) fail("reorder photos", error);
    }),
  );
  await syncProductImageMirror(productId);
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

/* ---------- Homepage content (hero) ---------- */

/**
 * The storefront homepage hero, stored as one `homepage_section_content` row
 * (section_id = 'hero'). Absent row ⇒ the storefront keeps its built-in
 * defaults, so saving this is always an override, never a requirement.
 *
 * Shape contract: content jsonb = HeroContent keys per language; images jsonb
 * = { desktop, mobile, alt: {fr, ar, en} }. Keep in sync with lib/domain.ts.
 */
const HERO_SECTION_ID = "hero";

function mapHeroSection(row: Row): HeroSection {
  const lang = (code: "fr" | "ar" | "en") => {
    const c = (row[`content_${code}`] ?? {}) as Record<string, unknown>;
    const text = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
    const href = (k: string) =>
      typeof c[k] === "string" && c[k] !== "" ? (c[k] as string) : undefined;
    return {
      titleLead: text("titleLead"),
      titleTail: text("titleTail"),
      support: text("support"),
      primaryCta: text("primaryCta"),
      primaryHref: href("primaryHref"),
      secondaryCta: text("secondaryCta"),
      secondaryHref: href("secondaryHref"),
    };
  };
  const img = (row.images ?? {}) as Record<string, unknown>;
  const alt = (img.alt ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    tenantId: str(row.tenant_id),
    fr: lang("fr"),
    ar: lang("ar"),
    en: lang("en"),
    images: {
      desktop: s(img.desktop),
      mobile: s(img.mobile),
      alt: { fr: s(alt.fr), ar: s(alt.ar), en: s(alt.en) },
    },
    updatedAt: row.updated_at == null ? null : str(row.updated_at),
  };
}

export async function getHeroSection(tenantId: string): Promise<HeroSection | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("homepage_section_content")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("section_id", HERO_SECTION_ID)
    .maybeSingle();
  if (error) fail("load hero section", error);
  return data ? mapHeroSection(oneOf(data)!) : null;
}

function heroLangJson(
  lang: HeroSection["fr"],
): Record<string, string | undefined> {
  return {
    titleLead: lang.titleLead.trim(),
    titleTail: lang.titleTail.trim(),
    support: lang.support.trim(),
    primaryCta: lang.primaryCta.trim(),
    primaryHref: lang.primaryHref?.trim() || undefined,
    secondaryCta: lang.secondaryCta.trim(),
    secondaryHref: lang.secondaryHref?.trim() || undefined,
  };
}

/** Upserts the hero row for a tenant (unique on (tenant_id, section_id)). */
export async function saveHeroSection(
  tenantId: string,
  section: Omit<HeroSection, "tenantId" | "updatedAt">,
): Promise<HeroSection> {
  const sb = getSupabase();
  const payload = {
    tenant_id: tenantId,
    section_id: HERO_SECTION_ID,
    content_fr: heroLangJson(section.fr),
    content_ar: heroLangJson(section.ar),
    content_en: heroLangJson(section.en),
    images: {
      desktop: section.images.desktop || undefined,
      mobile: section.images.mobile || undefined,
      alt: {
        fr: section.images.alt.fr.trim(),
        ar: section.images.alt.ar.trim(),
        en: section.images.alt.en.trim(),
      },
    },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("homepage_section_content")
    .upsert(payload, { onConflict: "tenant_id,section_id" })
    .select("*")
    .single();
  if (error) fail("save hero section", error);
  const row = oneOf(data);
  if (!row) throw new Error("save hero section: no row returned");
  return mapHeroSection(row);
}

/* ---------- Shipping & geography ---------- */

const METHOD_TYPES: ShippingMethodType[] = ["home", "desk", "pickup"];

function asMethodType(v: unknown): ShippingMethodType {
  return METHOD_TYPES.includes(v as ShippingMethodType)
    ? (v as ShippingMethodType)
    : "home";
}

function mapShippingMethod(r: Row): ShippingMethod {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    code: str(r.code),
    nameFr: str(r.name_fr),
    nameAr: str(r.name_ar),
    nameEn: str(r.name_en),
    descriptionFr: str(r.description_fr),
    type: asMethodType(r.type),
    provider: str(r.provider),
    basePrice: num(r.base_price),
    freeOverThreshold: r.free_over_threshold == null ? null : num(r.free_over_threshold),
    estimatedDaysMin: r.estimated_days_min == null ? null : num(r.estimated_days_min),
    estimatedDaysMax: r.estimated_days_max == null ? null : num(r.estimated_days_max),
    isActive: r.is_active == null ? true : bool(r.is_active, true),
    sortOrder: num(r.sort_order),
  };
}

/** The 58 Algerian wilayas, ordered by code. Static data — all tenants share it. */
export async function getWilayas(): Promise<Wilaya[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("wilayas").select("*").order("code");
  if (error) fail("load wilayas", error);
  return rowsOf(data).map((r) => ({
    code: num(r.code),
    nameFr: str(r.name_fr),
    nameAr: str(r.name_ar),
    nameEn: str(r.name_en),
    isActive: r.is_active == null ? true : bool(r.is_active, true),
  }));
}

/** Communes of one wilaya, ordered by `name_fr`. Public read, no tenant scope. */
export async function getCommunes(wilayaCode: number): Promise<Commune[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("communes")
    .select("id,wilaya_code,name_fr,name_ar")
    .eq("wilaya_code", wilayaCode)
    .order("name_fr");
  if (error) fail("load communes", error);
  return rowsOf(data).map((r) => ({
    id: str(r.id),
    wilayaCode: num(r.wilaya_code),
    nameFr: str(r.name_fr),
    nameAr: str(r.name_ar),
  }));
}

export async function getShippingMethods(tenantId: string): Promise<ShippingMethod[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("shipping_methods")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) fail("load shipping methods", error);
  return rowsOf(data).map(mapShippingMethod);
}

export interface ShippingMethodInput {
  tenantId: string;
  code: string;
  nameFr: string;
  nameAr: string | null;
  nameEn: string | null;
  descriptionFr: string | null;
  type: ShippingMethodType;
  provider: string | null;
  basePrice: number;
  freeOverThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  sortOrder: number;
}

export async function createShippingMethod(input: ShippingMethodInput): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("shipping_methods")
    .insert({
      tenant_id: input.tenantId,
      code: input.code.trim(),
      name_fr: input.nameFr.trim(),
      name_ar: input.nameAr?.trim() || null,
      name_en: input.nameEn?.trim() || null,
      description_fr: input.descriptionFr?.trim() || null,
      type: input.type,
      provider: input.provider?.trim() || null,
      base_price: input.basePrice,
      free_over_threshold: input.freeOverThreshold,
      estimated_days_min: input.estimatedDaysMin,
      estimated_days_max: input.estimatedDaysMax,
      is_active: input.isActive,
      sort_order: input.sortOrder,
    })
    .select("id")
    .single();
  if (error) fail("create shipping method", error);
  return str(oneOf(data)?.id);
}

export async function updateShippingMethod(
  id: string,
  patch: Partial<Omit<ShippingMethodInput, "tenantId">>,
): Promise<void> {
  const sb = getSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.code !== undefined) row.code = patch.code.trim();
  if (patch.nameFr !== undefined) row.name_fr = patch.nameFr.trim();
  if (patch.nameAr !== undefined) row.name_ar = patch.nameAr?.trim() || null;
  if (patch.nameEn !== undefined) row.name_en = patch.nameEn?.trim() || null;
  if (patch.descriptionFr !== undefined)
    row.description_fr = patch.descriptionFr?.trim() || null;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.provider !== undefined) row.provider = patch.provider?.trim() || null;
  if (patch.basePrice !== undefined) row.base_price = patch.basePrice;
  if (patch.freeOverThreshold !== undefined)
    row.free_over_threshold = patch.freeOverThreshold;
  if (patch.estimatedDaysMin !== undefined) row.estimated_days_min = patch.estimatedDaysMin;
  if (patch.estimatedDaysMax !== undefined) row.estimated_days_max = patch.estimatedDaysMax;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await sb.from("shipping_methods").update(row).eq("id", id);
  if (error) fail("update shipping method", error);
}

export async function deleteShippingMethod(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("shipping_methods").delete().eq("id", id);
  if (error) {
    if (String((error as { code?: string }).code) === "23503") {
      throw new Error("shipping method is still referenced and cannot be deleted");
    }
    fail("delete shipping method", error);
  }
}

/**
 * Reorders methods by rewriting the full `sort_order` sequence — the up/down
 * buttons swap two neighbours, then the caller persists every id in order.
 */
export async function reorderShippingMethods(
  tenantId: string,
  orderedIds: string[],
): Promise<void> {
  const sb = getSupabase();
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const { error } = await sb
        .from("shipping_methods")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) fail("reorder shipping methods", error);
    }),
  );
}

function mapDeliveryZone(r: Row): DeliveryZone {
  return {
    id: str(r.id),
    tenantId: str(r.tenant_id),
    wilayaCode: num(r.wilaya_code),
    methodCode: str(r.method_code),
    deliveryFee: num(r.delivery_fee),
    freeOverThreshold: r.free_delivery_threshold == null ? null : num(r.free_delivery_threshold),
    minimumOrder: r.minimum_order == null ? null : num(r.minimum_order),
    isActive: r.is_active == null ? true : bool(r.is_active, true),
  };
}

export async function getDeliveryZones(tenantId: string): Promise<DeliveryZone[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("delivery_zones")
    .select("id,tenant_id,wilaya_code,method_code,delivery_fee,minimum_order,free_delivery_threshold,is_active")
    .eq("tenant_id", tenantId);
  if (error) fail("load delivery zones", error);
  return rowsOf(data).map(mapDeliveryZone);
}

export interface DeliveryZoneInput {
  tenantId: string;
  wilayaCode: number;
  methodCode: string;
  deliveryFee: number;
  freeOverThreshold: number | null;
  minimumOrder: number | null;
  isActive: boolean;
}

/**
 * Upserts one (tenant, wilaya, method) rate.
 *
 * `delivery_zones` has no unique constraint on the triple, so instead of a
 * plain `upsert` the existing row id is read first and the write is an update
 * or an insert. `name` is NOT NULL → the wilaya's `name_fr` fills it
 * (`wilaya`/`wilaya_code`/`method_code` are also kept in sync — the legacy
 * columns predate the code pair and other consumers still read them).
 * `tenant_id` is uuid here while the rest of the app keeps text; the uuid
 * string compares fine.
 */
export async function upsertDeliveryZone(input: DeliveryZoneInput): Promise<void> {
  const sb = getSupabase();
  const { data: wData, error: wErr } = await sb
    .from("wilayas")
    .select("name_fr")
    .eq("code", input.wilayaCode)
    .maybeSingle();
  if (wErr) fail("load wilaya", wErr);
  const name = str(oneOf(wData)?.name_fr) || `Wilaya ${input.wilayaCode}`;

  // Limit the lookup to the tenant: ids from another tenant are other rows in
  // this shared table and must never be updated by this call.
  const { data: zData, error: zErr } = await sb
    .from("delivery_zones")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("wilaya_code", input.wilayaCode)
    .eq("method_code", input.methodCode);
  if (zErr) fail("load delivery zone", zErr);
  const existing = oneOf(zData);

  const payload = {
    delivery_fee: input.deliveryFee,
    free_delivery_threshold: input.freeOverThreshold,
    minimum_order: input.minimumOrder,
    is_active: input.isActive,
    wilaya: name,
    wilaya_code: input.wilayaCode,
    method_code: input.methodCode,
  };

  if (existing) {
    const { error } = await sb
      .from("delivery_zones")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", str(existing.id))
      .eq("tenant_id", input.tenantId);
    if (error) fail("update delivery zone", error);
    return;
  }

  const { error } = await sb.from("delivery_zones").insert({
    tenant_id: input.tenantId,
    name,
    ...payload,
  });
  if (error) fail("create delivery zone", error);
}

/** Bulk-applies one fee/active pair to every wilaya via the same triple upsert. */
export async function applyDeliveryFeeToAllWilayas(input: {
  tenantId: string;
  methodCode: string;
  deliveryFee: number;
}): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.from("wilayas").select("code").order("code");
  if (error) fail("load wilayas", error);
  const codes = rowsOf(data).map((r) => num(r.code));

  // The optional columns are not part of the bulk fee — rows that already
  // exist keep their stored free-over/minimum/active values.
  const { data: zData, error: zErr } = await sb
    .from("delivery_zones")
    .select("wilaya_code,free_delivery_threshold,minimum_order,is_active")
    .eq("tenant_id", input.tenantId)
    .eq("method_code", input.methodCode);
  if (zErr) fail("load delivery zones", zErr);
  const existing = new Map(
    rowsOf(zData).map((r) => [num(r.wilaya_code), r]),
  );

  for (const wilayaCode of codes) {
    const zone = existing.get(wilayaCode);
    await upsertDeliveryZone({
      tenantId: input.tenantId,
      wilayaCode,
      methodCode: input.methodCode,
      deliveryFee: input.deliveryFee,
      freeOverThreshold:
        zone && zone.free_delivery_threshold != null ? num(zone.free_delivery_threshold) : null,
      minimumOrder: zone && zone.minimum_order != null ? num(zone.minimum_order) : null,
      isActive: zone ? bool(zone.is_active, true) : true,
    });
  }
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
