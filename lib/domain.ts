/**
 * ESTINAD Central — domain model.
 *
 * Mirrors the cloud-admin / ESTINAD Core contract (tenants, catalog, orders,
 * reporting views, trilingual content). The service layer in `lib/services`
 * is the only place that talks to a backend; swap the mock adapter for
 * Supabase / ESTINAD Core without touching UI code.
 */

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";
export type TenantRole = "owner" | "manager" | "viewer";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  businessName: string | null;
  businessAddress: string | null;
  businessType: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  trialEndsAt: string | null;
  storefrontEnabled: boolean;
  storefrontSlug: string | null;
  storefrontDescription: string | null;
  onlineOrderingEnabled: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
  reservationsEnabled: boolean;
  minOrderAmount: number;
  estimatedPrepTime: number;
  autoAcceptOrders: boolean;
  latitude: number | null;
  longitude: number | null;
  brand: BrandConfig;
  /** Storefront-facing contact block (`tenants.config.contact`). The
   *  storefront footer reads `tenant.config.contact.{email,phone,whatsapp,
   *  address,instagram,facebook}` — these exact keys, never rename them. */
  contact: ContactInfo;
  /** Weekly opening hours from `tenants.operating_hours`, keyed by day index
   *  ("0" = Sunday … "6" = Saturday). Absent keys mean "closed". */
  operatingHours: Record<string, DayHours>;
  createdAt: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  address: string;
  instagram: string;
  facebook: string;
  tiktok: string;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface BrandConfig {
  tagline: Record<LangCode, string>;
  siteTitle: Record<LangCode, string>;
  metaDescription: Record<LangCode, string>;
  logoUrl: string | null;
}

export type LangCode = "fr" | "ar" | "en";

export interface Language {
  code: LangCode;
  name: string;
  nativeName: string;
  isDefault: boolean;
  isRtl: boolean;
  isActive: boolean;
}

export type ProductType = "simple" | "variable" | "composite";
export type PrinterDest = "kitchen" | "bar" | "oven" | null;

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  type: ProductType;
  price: number;
  costPrice: number | null;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  isAvailable: boolean;
  /**
   * Best display URL: the gallery's primary image, else a legacy URL.
   * Never a bare filename — the POS stores those in `products.image` for some
   * products and they cannot be rendered.
   */
  image: string | null;
  /** Mirrored gallery URLs, then any legacy URLs pointing at other hosts. */
  images: string[];
  printerDest: PrinterDest;
  shortDescription: string | null;
  /** Storefront long copy. Markdown-formatted plain text; shown on the online product page. */
  longDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductTranslation {
  productId: string;
  languageCode: LangCode;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
}

/**
 * A photo in the tenant's media library (`media_assets`).
 *
 * This is the base every image starts as: the bytes live in the
 * `product-media` bucket and the row carries the organisation — `folder`,
 * `tags`, `isFavorite`. Product galleries reference an asset through
 * `product_media.asset_id` (keeping their own order + primary flag), so one
 * upload can serve several products, a long description or a category tile.
 */
export interface MediaAsset extends MediaItem {
  tenantId: string;
  storageBucket: string;
  storagePath: string;
  /** Path-style, `''` for the library root, e.g. `Miels/Sidr`. */
  folder: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The shape every media component works with.
 *
 * The gallery, the image picker and single-image fields depend on this — never
 * on where the images come from — so a different source (a product's photos, a
 * tenant-wide library, a category tile) can be plugged in without touching a
 * consumer.
 */
export interface MediaItem {
  id: string;
  url: string;
  /** Alternative text; this is also what the markdown picker writes into `![alt]`. */
  alt: string | null;
}

/**
 * A photo attached to a product.
 *
 * Rows live in `product_media`, the bytes in the `product-media` Storage
 * bucket, and `url` is the derived public URL. This is the canonical gallery:
 * the storefront reads it first and only falls back to `Product.images`.
 */
export interface ProductMedia extends MediaItem {
  productId: string;
  storageBucket: string;
  storagePath: string;
  /** Library asset this photo comes from; `null` for rows created before the library. */
  assetId: string | null;
  isPrimary: boolean;
  position: number;
  createdAt: string;
}

export interface Variant {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  /** Final price = `Product.price` + this modifier. */
  priceMod: number;
  sku: string | null;
  barcode: string | null;
  /** Image for this variant; falls back to the product gallery when null. */
  image: string | null;
  isAvailable: boolean;
  trackStock: boolean;
  weight: number | null;
  weightUnit: string | null;
  color: string | null;
  /** Swatch colour (hex) when the option is a colour. */
  colorHex: string | null;
  /** Option values, e.g. `{ "Poids": "500g" }`. Empty for flat variants. */
  attributeValues: Record<string, string>;
  /** `variant_translations` rows, when the caller loaded them. */
  translations?: VariantTranslation[];
}

export type AttributeKind = "select" | "color";

/**
 * A tenant-level option used to build variant matrices ("Poids", "Couleur").
 *
 * Shared across every product of the tenant — `product_attributes` has no
 * product column — so the manager in the product form edits the tenant's option
 * vocabulary, not a per-product one.
 */
export interface ProductAttribute {
  id: string;
  tenantId: string;
  name: string;
  type: AttributeKind;
  values: ProductAttributeValue[];
}

export interface ProductAttributeValue {
  id: string;
  attributeId: string;
  value: string;
  colorHex: string | null;
}

export interface VariantTranslation {
  variantId: string;
  languageCode: LangCode;
  name: string;
}

export type CategoryType = "retail" | "hospitality" | "service";

export interface Category {
  id: string;
  tenantId: string;
  /** Base name (POS-owned). Per-language names live in `translations`. */
  name: string;
  type: CategoryType;
  parentId: string | null;
  productCount: number;
  /** Public URL shown on the storefront category tile; `null` when unset. */
  image: string | null;
  /** `category_translations` rows, when the caller loaded them. */
  translations?: CategoryTranslation[];
}

export interface CategoryTranslation {
  categoryId: string;
  languageCode: LangCode;
  name: string;
}

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "void";
export type OrderType = "dine_in" | "takeaway" | "delivery";
export type PaymentMethod = "cash" | "cib_card" | "edahabia" | "check" | "qr";

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  waiterName: string | null;
  totalGross: number;
  discountAmount: number;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  lines: OrderLine[];
}

export interface OrderLine {
  id: string;
  productName: string;
  variantName: string | null;
  qty: number;
  unitPrice: number;
}

export type ShippingStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface OnlineOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  wilaya: string;
  commune: string;
  address: string | null;
  shippingStatus: ShippingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  total: number;
  trackingNumber: string | null;
  note: string | null;
  createdAt: string;
  items: OnlineOrderItem[];
}

export interface OnlineOrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  qty: number;
  unitPrice: number;
}

/* Reporting (aggregated views in Core; computed locally in the mock) */

export interface DailySales {
  date: string;
  orderCount: number;
  completedCount: number;
  totalRevenue: number;
  completedRevenue: number;
  avgOrderValue: number;
}

export interface HourlySales {
  hour: number;
  orderCount: number;
  revenue: number;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  categoryName: string | null;
  timesSold: number;
  totalQuantity: number;
  totalRevenue: number;
}

export interface PaymentBreakdown {
  method: PaymentMethod;
  paymentCount: number;
  totalAmount: number;
}

export interface DashboardSummary {
  revenueToday: number;
  revenueDelta: number;
  ordersToday: number;
  ordersDelta: number;
  avgOrderValue: number;
  completionRate: number;
  activeOrders: number;
  lowStockCount: number;
}

/* ---------- Homepage content (hero) ---------- */

/**
 * Trilingual hero copy for the storefront homepage. Keys mirror the storefront
 * `honeyHome.hero` message bundle so editing only overrides the defaults.
 */
export interface HeroContent {
  titleLead: string;
  titleTail: string;
  support: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
}

/** Hero imagery: one art-directed pair per storefront `<picture>`. */
export interface HeroImages {
  desktop: string;
  mobile: string;
  /** Alt text per language, mirroring the copy keys. */
  alt: { fr: string; ar: string; en: string };
}

/* ---------- Shipping & geography ---------- */

/** Algerian wilaya (static table `wilayas`, 58 rows, not tenant-scoped). */
export interface Wilaya {
  code: number;
  nameFr: string;
  nameAr: string;
  /** Empty in the live table for most rows. */
  nameEn: string;
  isActive: boolean;
}

/** Commune of a wilaya (`communes`, public read only, no tenant scope). */
export interface Commune {
  id: string;
  wilayaCode: number;
  nameFr: string;
  nameAr: string;
}

/** `shipping_methods.type` — how the parcel reaches the customer. */
export type ShippingMethodType = "home" | "desk" | "pickup";

export interface ShippingMethod {
  id: string;
  tenantId: string;
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  descriptionFr: string;
  type: ShippingMethodType;
  provider: string;
  basePrice: number;
  freeOverThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  sortOrder: number;
}

/**
 * One wilaya × method rate in `delivery_zones`. Only the pricing columns are
 * managed here; the storefront-facing extras (name, polygon, postal codes…)
 * keep their stored values.
 */
export interface DeliveryZone {
  id: string;
  tenantId: string;
  wilayaCode: number;
  methodCode: string;
  deliveryFee: number;
  freeOverThreshold: number | null;
  minimumOrder: number | null;
  isActive: boolean;
}

export interface HeroSection {
  tenantId: string;
  fr: Omit<HeroContent, "primaryHref" | "secondaryHref"> & {
    primaryHref?: string;
    secondaryHref?: string;
  };
  ar: Omit<HeroContent, "primaryHref" | "secondaryHref"> & {
    primaryHref?: string;
    secondaryHref?: string;
  };
  en: Omit<HeroContent, "primaryHref" | "secondaryHref"> & {
    primaryHref?: string;
    secondaryHref?: string;
  };
  images: HeroImages;
  updatedAt: string | null;
}
