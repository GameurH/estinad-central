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
  createdAt: string;
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
  image: string | null;
  /** Legacy RMS image URLs. Products with uploaded media use `product_media` instead. */
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
  isPrimary: boolean;
  position: number;
  createdAt: string;
}

export interface Variant {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  priceMod: number;
  sku: string | null;
  barcode: string | null;
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
