/**
 * Service layer — the ONLY boundary between UI and data.
 *
 * Today these functions resolve from the local demo dataset with a short
 * simulated latency (so loading states are real). To integrate ESTINAD Core
 * or Supabase: reimplement the functions in this file against the backend
 * client and keep every signature identical — no UI changes required.
 */
import {
  DEMO_CATEGORIES,
  DEMO_CATEGORY_TRANSLATIONS,
  DEMO_ONLINE_ORDERS,
  DEMO_ORDERS,
  DEMO_PRODUCTS,
  DEMO_PRODUCT_TRANSLATIONS,
  DEMO_TENANTS,
  DEMO_VARIANTS,
  DEMO_VARIANT_TRANSLATIONS,
} from "@/lib/demo-data";
import type {
  Category,
  DailySales,
  DashboardSummary,
  HourlySales,
  OnlineOrder,
  Order,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  ProductPerformance,
  Tenant,
  Variant,
} from "@/lib/domain";

const LATENCY_MS = 180;

function delayed<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/* ---------- Tenants ---------- */

export function getTenants(): Promise<Tenant[]> {
  return delayed([...DEMO_TENANTS]);
}

export function getTenant(id: string): Promise<Tenant | null> {
  return delayed(DEMO_TENANTS.find((t) => t.id === id) ?? null);
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

export async function getProducts(tenantId: string): Promise<ProductListItem[]> {
  const categories = new Map(DEMO_CATEGORIES.map((c) => [c.id, c.name]));
  const variantCounts = new Map<string, number>();
  for (const v of DEMO_VARIANTS) {
    variantCounts.set(v.productId, (variantCounts.get(v.productId) ?? 0) + 1);
  }
  return delayed(
    DEMO_PRODUCTS.filter((p) => p.tenantId === tenantId).map((p) => ({
      ...p,
      categoryName: p.categoryId ? (categories.get(p.categoryId) ?? null) : null,
      variantCount: variantCounts.get(p.id) ?? 0,
    })),
  );
}

export async function getProduct(
  tenantId: string,
  id: string,
): Promise<(Product & { variants: Variant[] }) | null> {
  const found = DEMO_PRODUCTS.find((p) => p.tenantId === tenantId && p.id === id);
  if (!found) return delayed(null);
  return delayed({
    ...found,
    variants: DEMO_VARIANTS.filter((v) => v.productId === id),
  });
}

export function getCategories(tenantId: string): Promise<Category[]> {
  return delayed(DEMO_CATEGORIES.filter((c) => c.tenantId === tenantId));
}

export function getProductName(
  product: Product,
  lang: string,
): string {
  if (lang === "fr") return product.name;
  const tr = DEMO_PRODUCT_TRANSLATIONS.find(
    (t) => t.productId === product.id && t.languageCode === lang,
  );
  return tr?.name ?? product.name;
}

export function getCategoryName(category: Category, lang: string): string {
  if (lang === "fr") return category.name;
  const tr = DEMO_CATEGORY_TRANSLATIONS.find(
    (t) => t.categoryId === category.id && t.languageCode === lang,
  );
  return tr?.name ?? category.name;
}

export function getVariantName(variant: Variant, lang: string): string {
  if (lang === "fr") return variant.name;
  const tr = DEMO_VARIANT_TRANSLATIONS.find(
    (t) => t.variantId === variant.id && t.languageCode === lang,
  );
  return tr?.name ?? variant.name;
}

export function missingTranslationLangs(
  kind: "product" | "category" | "variant",
  id: string,
): string[] {
  const missing: string[] = [];
  for (const lang of ["ar", "en"] as const) {
    const has =
      kind === "product"
        ? DEMO_PRODUCT_TRANSLATIONS.some(
            (t) => t.productId === id && t.languageCode === lang,
          )
        : kind === "category"
          ? DEMO_CATEGORY_TRANSLATIONS.some(
              (t) => t.categoryId === id && t.languageCode === lang,
            )
          : DEMO_VARIANT_TRANSLATIONS.some(
              (t) => t.variantId === id && t.languageCode === lang,
            );
    if (!has) missing.push(lang);
  }
  return missing;
}

/* ---------- Orders ---------- */

export function getOrders(tenantId: string): Promise<Order[]> {
  return delayed(
    [...DEMO_ORDERS]
      .filter((o) => o.tenantId === tenantId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  );
}

export function getOnlineOrders(tenantId: string): Promise<OnlineOrder[]> {
  return delayed(
    [...DEMO_ONLINE_ORDERS]
      .filter((o) => o.tenantId === tenantId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  );
}

/* ---------- Dashboard / reports ---------- */

const COMPLETED: Order["status"][] = ["completed"];

export async function getDashboardSummary(tenantId: string): Promise<DashboardSummary> {
  const orders = DEMO_ORDERS.filter((o) => o.tenantId === tenantId);
  const today = startOfDay(new Date()).getTime();
  const yesterday = today - 86400_000;
  const inDay = (iso: string, from: number, to: number) => {
    const t = new Date(iso).getTime();
    return t >= from && t < to;
  };
  const rev = (list: Order[]) =>
    list
      .filter((o) => COMPLETED.includes(o.status))
      .reduce((s, o) => s + o.totalGross - o.discountAmount, 0);

  const todayOrders = orders.filter((o) => inDay(o.createdAt, today, today + 86400_000));
  const yOrders = orders.filter((o) => inDay(o.createdAt, yesterday, today));
  const revenueToday = rev(todayOrders);
  const revenueYesterday = rev(yOrders);
  const completedToday = todayOrders.filter((o) => o.status === "completed").length;
  const avg =
    completedToday > 0 ? Math.round(revenueToday / completedToday) : 0;
  const actionable = orders.filter((o) =>
    ["confirmed", "preparing", "ready"].includes(o.status),
  ).length;

  return delayed({
    revenueToday,
    revenueDelta:
      revenueYesterday > 0
        ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
        : 0,
    ordersToday: todayOrders.length,
    ordersDelta: todayOrders.length - yOrders.length,
    avgOrderValue: avg,
    completionRate:
      todayOrders.length > 0
        ? Math.round((completedToday / todayOrders.length) * 100)
        : 100,
    activeOrders: actionable,
    lowStockCount: 0,
  });
}

export function getHourlySales(tenantId: string): Promise<HourlySales[]> {
  const orders = DEMO_ORDERS.filter((o) => o.tenantId === tenantId);
  const buckets = new Map<number, { orderCount: number; revenue: number }>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const h = new Date(o.createdAt).getHours();
    const b = buckets.get(h) ?? { orderCount: 0, revenue: 0 };
    b.orderCount += 1;
    b.revenue += o.totalGross - o.discountAmount;
    buckets.set(h, b);
  }
  return delayed(
    [...buckets.entries()]
      .map(([hour, v]) => ({ hour, ...v }))
      .sort((a, b) => a.hour - b.hour),
  );
}

export function getDailySales(tenantId: string, days = 7): Promise<DailySales[]> {
  const orders = DEMO_ORDERS.filter((o) => o.tenantId === tenantId);
  const rows: DailySales[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const from = startOfDay(d).getTime();
    const day = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= from && t < from + 86400_000;
    });
    const completed = day.filter((o) => o.status === "completed");
    const revenue = completed.reduce((s, o) => s + o.totalGross - o.discountAmount, 0);
    rows.push({
      date: new Date(from).toISOString(),
      orderCount: day.length,
      completedCount: completed.length,
      totalRevenue: revenue,
      completedRevenue: revenue,
      avgOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
    });
  }
  return delayed(rows);
}

export function getTopProducts(tenantId: string, limit = 5): Promise<ProductPerformance[]> {
  const orders = DEMO_ORDERS.filter(
    (o) => o.tenantId === tenantId && o.status === "completed",
  );
  const categories = new Map(DEMO_CATEGORIES.map((c) => [c.id, c.name]));
  const products = new Map(DEMO_PRODUCTS.map((p) => [p.name, p]));
  const agg = new Map<string, ProductPerformance>();
  for (const o of orders) {
    for (const l of o.lines) {
      const p = products.get(l.productName);
      const row = agg.get(l.productName) ?? {
        productId: p?.id ?? l.productName,
        name: l.productName,
        categoryName: p?.categoryId
          ? (categories.get(p.categoryId) ?? null)
          : null,
        timesSold: 0,
        totalQuantity: 0,
        totalRevenue: 0,
      };
      row.timesSold += 1;
      row.totalQuantity += l.qty;
      row.totalRevenue += l.qty * l.unitPrice;
      agg.set(l.productName, row);
    }
  }
  return delayed(
    [...agg.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit),
  );
}

export function getPaymentBreakdown(tenantId: string): Promise<PaymentBreakdown[]> {
  const orders = DEMO_ORDERS.filter(
    (o) => o.tenantId === tenantId && o.status === "completed" && o.paymentMethod,
  );
  const agg = new Map<PaymentMethod, PaymentBreakdown>();
  for (const o of orders) {
    const m = o.paymentMethod as PaymentMethod;
    const row = agg.get(m) ?? { method: m, paymentCount: 0, totalAmount: 0 };
    row.paymentCount += 1;
    row.totalAmount += o.totalGross - o.discountAmount;
    agg.set(m, row);
  }
  return delayed(
    [...agg.values()].sort((a, b) => b.totalAmount - a.totalAmount),
  );
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
