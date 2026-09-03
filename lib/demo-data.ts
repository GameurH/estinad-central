/**
 * Demo dataset for ESTINAD Central.
 *
 * Mirrors the ESTINAD Core contract (Algiers-market restaurant). The service
 * layer (`lib/services/*`) reads from here today; pointing it at Supabase /
 * ESTINAD Core later requires no UI changes.
 */
import type {
  Category,
  CategoryTranslation,
  LangCode,
  OnlineOrder,
  Order,
  Product,
  ProductTranslation,
  Tenant,
  Variant,
  VariantTranslation,
} from "@/lib/domain";

function daysAgo(n: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3600_000).toISOString();
}
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

const emptyBrand = (fr: string, ar: string, en: string) => ({
  tagline: { fr, ar, en } as Record<LangCode, string>,
  siteTitle: { fr, ar, en } as Record<LangCode, string>,
  metaDescription: { fr, ar, en } as Record<LangCode, string>,
  logoUrl: null,
});

export const DEMO_TENANTS: Tenant[] = [
  {
    id: "t-alger",
    name: "Maison Olive — Alger",
    slug: "maison-olive-alger",
    status: "trial",
    businessName: "Maison Olive SARL",
    businessAddress: "12 Rue Didouche Mourad, Alger Centre",
    businessType: "Restaurant",
    ownerEmail: "contact@maison-olive.dz",
    ownerPhone: "+213 550 12 34 56",
    trialEndsAt: new Date(Date.now() + 9 * 86400_000).toISOString(),
    storefrontEnabled: true,
    storefrontSlug: "maison-olive",
    onlineOrderingEnabled: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    dineInEnabled: true,
    reservationsEnabled: false,
    minOrderAmount: 500,
    estimatedPrepTime: 25,
    autoAcceptOrders: false,
    latitude: 36.7755,
    longitude: 3.0605,
    brand: emptyBrand(
      "Cuisine algéroise, feu de bois",
      "مطبخ عاصمي على الحطب",
      "Algiers cuisine, wood-fired",
    ),
    createdAt: daysAgo(40),
  },
  {
    id: "t-oran",
    name: "Maison Olive — Oran",
    slug: "maison-olive-oran",
    status: "active",
    businessName: "Maison Olive Oran",
    businessAddress: "8 Bd de la Soummam, Oran",
    businessType: "Restaurant",
    ownerEmail: "oran@maison-olive.dz",
    ownerPhone: "+213 661 98 76 54",
    trialEndsAt: null,
    storefrontEnabled: true,
    storefrontSlug: "maison-olive-oran",
    onlineOrderingEnabled: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    dineInEnabled: true,
    reservationsEnabled: true,
    minOrderAmount: 400,
    estimatedPrepTime: 20,
    autoAcceptOrders: true,
    latitude: 35.6969,
    longitude: -0.6331,
    brand: emptyBrand("Saveurs de l'Ouest", "نكهات الغرب", "Flavours of the West"),
    createdAt: daysAgo(120),
  },
];

export const DEMO_CATEGORIES: Category[] = [
  { id: "c-entrees", tenantId: "t-alger", name: "Entrées", type: "hospitality", parentId: null, productCount: 3 },
  { id: "c-plats", tenantId: "t-alger", name: "Plats", type: "hospitality", parentId: null, productCount: 5 },
  { id: "c-grillades", tenantId: "t-alger", name: "Grillades", type: "hospitality", parentId: "c-plats", productCount: 2 },
  { id: "c-desserts", tenantId: "t-alger", name: "Desserts", type: "hospitality", parentId: null, productCount: 2 },
  { id: "c-boissons", tenantId: "t-alger", name: "Boissons", type: "hospitality", parentId: null, productCount: 3 },
];

export const DEMO_CATEGORY_TRANSLATIONS: CategoryTranslation[] = [
  { categoryId: "c-entrees", languageCode: "ar", name: "المقبلات" },
  { categoryId: "c-entrees", languageCode: "en", name: "Starters" },
  { categoryId: "c-plats", languageCode: "ar", name: "الأطباق" },
  { categoryId: "c-plats", languageCode: "en", name: "Mains" },
  { categoryId: "c-grillades", languageCode: "ar", name: "المشويات" },
  { categoryId: "c-grillades", languageCode: "en", name: "Grill" },
  { categoryId: "c-desserts", languageCode: "ar", name: "الحلويات" },
  { categoryId: "c-desserts", languageCode: "en", name: "Desserts" },
  { categoryId: "c-boissons", languageCode: "ar", name: "المشروبات" },
  { categoryId: "c-boissons", languageCode: "en", name: "Drinks" },
];

interface P extends Omit<Product, "images" | "createdAt" | "updatedAt"> {
  images?: string[];
}

function p(row: P): Product {
  return {
    ...row,
    images: row.images ?? [],
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
  };
}

export const DEMO_PRODUCTS: Product[] = [
  p({ id: "p-chorba", tenantId: "t-alger", name: "Chorba frik", type: "simple", price: 350, costPrice: 120, categoryId: "c-entrees", sku: "ENT-001", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Soupe traditionnelle au blé vert, coriandre." }),
  p({ id: "p-bourek", tenantId: "t-alger", name: "Bourek annabi (x3)", type: "simple", price: 450, costPrice: 160, categoryId: "c-entrees", sku: "ENT-002", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Feuilleté croustillant, viande hachée, œuf." }),
  p({ id: "p-salade", tenantId: "t-alger", name: "Salade méchouia", type: "simple", price: 400, costPrice: 110, categoryId: "c-entrees", sku: "ENT-003", barcode: null, isAvailable: false, image: null, printerDest: "kitchen", shortDescription: "Poivrons grillés, tomate, œuf dur." }),
  p({ id: "p-couscous", tenantId: "t-alger", name: "Couscous royal", type: "variable", price: 950, costPrice: 380, categoryId: "c-plats", sku: "PLT-001", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Semoule fine, légumes, viande au choix." }),
  p({ id: "p-rechta", tenantId: "t-alger", name: "Rechta algéroise", type: "simple", price: 800, costPrice: 300, categoryId: "c-plats", sku: "PLT-002", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Nouilles fines, poulet fermier, navets." }),
  p({ id: "p-chakhchoukha", tenantId: "t-alger", name: "Chakhchoukha", type: "simple", price: 850, costPrice: 320, categoryId: "c-plats", sku: "PLT-003", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Rogag émietté, sauce tomate épicée." }),
  p({ id: "p-mixte", tenantId: "t-alger", name: "Assiette mixte", type: "simple", price: 1400, costPrice: 620, categoryId: "c-grillades", sku: "GRL-001", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Brochettes, merguez, kefta au feu de bois." }),
  p({ id: "p-poulet", tenantId: "t-alger", name: "Poulet rôti au feu", type: "variable", price: 1100, costPrice: 480, categoryId: "c-grillades", sku: "GRL-002", barcode: null, isAvailable: true, image: null, printerDest: "oven", shortDescription: "Poulet fermier mariné, jus corsé." }),
  p({ id: "p-mhalbi", tenantId: "t-alger", name: "Mhalbi", type: "simple", price: 300, costPrice: 90, categoryId: "c-desserts", sku: "DES-001", barcode: null, isAvailable: true, image: null, printerDest: "bar", shortDescription: "Crème de riz, cannelle, amandes." }),
  p({ id: "p-makroud", tenantId: "t-alger", name: "Makroud (x4)", type: "simple", price: 350, costPrice: 100, categoryId: "c-desserts", sku: "DES-002", barcode: null, isAvailable: true, image: null, printerDest: "bar", shortDescription: "Semoule, dattes, miel." }),
  p({ id: "p-the", tenantId: "t-alger", name: "Thé à la menthe", type: "simple", price: 200, costPrice: 40, categoryId: "c-boissons", sku: "BOI-001", barcode: null, isAvailable: true, image: null, printerDest: "bar", shortDescription: "Thé vert, menthe fraîche." }),
  p({ id: "p-jus", tenantId: "t-alger", name: "Jus d'orange pressé", type: "simple", price: 300, costPrice: 90, categoryId: "c-boissons", sku: "BOI-002", barcode: null, isAvailable: true, image: null, printerDest: "bar", shortDescription: "Oranges de la Mitidja." }),
  p({ id: "p-eau", tenantId: "t-alger", name: "Eau minérale 50cl", type: "simple", price: 150, costPrice: 50, categoryId: "c-boissons", sku: "BOI-003", barcode: "613000000001", isAvailable: true, image: null, printerDest: null, shortDescription: null }),
  p({ id: "p-tajine", tenantId: "t-alger", name: "Tajine zitoune", type: "simple", price: 900, costPrice: 350, categoryId: "c-plats", sku: "PLT-004", barcode: null, isAvailable: false, image: null, printerDest: "kitchen", shortDescription: "Poulet, olives violettes, citron confit." }),
  p({ id: "p-loubia", tenantId: "t-alger", name: "Loubia", type: "simple", price: 500, costPrice: 150, categoryId: "c-plats", sku: "PLT-005", barcode: null, isAvailable: true, image: null, printerDest: "kitchen", shortDescription: "Haricots blancs, cumin, huile d'olive." }),
];

export const DEMO_PRODUCT_TRANSLATIONS: ProductTranslation[] = [
  { productId: "p-couscous", languageCode: "ar", name: "كسكس ملكي", shortDescription: "سميد ناعم، خضار، لحم حسب الاختيار." },
  { productId: "p-couscous", languageCode: "en", name: "Royal couscous", shortDescription: "Fine semolina, vegetables, meat of choice." },
  { productId: "p-chorba", languageCode: "ar", name: "شربة فريك", shortDescription: "شوربة تقليدية بالقمح الأخضر." },
  { productId: "p-chorba", languageCode: "en", name: "Frik soup", shortDescription: "Traditional green-wheat soup." },
  { productId: "p-mixte", languageCode: "ar", name: "طبق مشكل", shortDescription: "أسياخ، مرقاز، كفتة على الحطب." },
  { productId: "p-mixte", languageCode: "en", name: "Mixed grill", shortDescription: "Skewers, merguez, kefta over wood fire." },
  { productId: "p-the", languageCode: "ar", name: "أتاي بالنعناع", shortDescription: "شاي أخضر بالنعناع الطازج." },
  { productId: "p-the", languageCode: "en", name: "Mint tea", shortDescription: "Green tea, fresh mint." },
];

export const DEMO_VARIANTS: Variant[] = [
  { id: "v-couscous-poulet", tenantId: "t-alger", productId: "p-couscous", name: "Poulet", priceMod: 0, sku: "PLT-001-P", barcode: null },
  { id: "v-couscous-viande", tenantId: "t-alger", productId: "p-couscous", name: "Viande", priceMod: 250, sku: "PLT-001-V", barcode: null },
  { id: "v-couscous-merguez", tenantId: "t-alger", productId: "p-couscous", name: "Merguez", priceMod: 150, sku: "PLT-001-M", barcode: null },
  { id: "v-poulet-entier", tenantId: "t-alger", productId: "p-poulet", name: "Entier", priceMod: 0, sku: "GRL-002-E", barcode: null },
  { id: "v-poulet-demi", tenantId: "t-alger", productId: "p-poulet", name: "Demi", priceMod: -450, sku: "GRL-002-D", barcode: null },
];

export const DEMO_VARIANT_TRANSLATIONS: VariantTranslation[] = [
  { variantId: "v-couscous-poulet", languageCode: "ar", name: "دجاج" },
  { variantId: "v-couscous-viande", languageCode: "ar", name: "لحم" },
  { variantId: "v-couscous-poulet", languageCode: "en", name: "Chicken" },
  { variantId: "v-couscous-viande", languageCode: "en", name: "Beef" },
];

type OL = Omit<Order, "lines"> & { lines: Order["lines"] };

function o(row: OL): Order {
  return row;
}

export const DEMO_ORDERS: Order[] = [
  o({ id: "o-1042", tenantId: "t-alger", orderNumber: "CMD-1042", status: "preparing", type: "dine_in", waiterName: "Yacine", totalGross: 2350, discountAmount: 0, paymentMethod: null, createdAt: minutesAgo(12), lines: [
    { id: "l-1", productName: "Assiette mixte", variantName: null, qty: 1, unitPrice: 1400 },
    { id: "l-2", productName: "Couscous royal", variantName: "Viande", qty: 1, unitPrice: 1200 },
  ] }),
  o({ id: "o-1041", tenantId: "t-alger", orderNumber: "CMD-1041", status: "ready", type: "takeaway", waiterName: "Amine", totalGross: 1600, discountAmount: 0, paymentMethod: null, createdAt: minutesAgo(28), lines: [
    { id: "l-3", productName: "Rechta algéroise", variantName: null, qty: 2, unitPrice: 800 },
  ] }),
  o({ id: "o-1040", tenantId: "t-alger", orderNumber: "CMD-1040", status: "confirmed", type: "delivery", waiterName: null, totalGross: 1750, discountAmount: 100, paymentMethod: null, createdAt: minutesAgo(41), lines: [
    { id: "l-4", productName: "Chakhchoukha", variantName: null, qty: 1, unitPrice: 850 },
    { id: "l-5", productName: "Bourek annabi (x3)", variantName: null, qty: 2, unitPrice: 450 },
  ] }),
  o({ id: "o-1039", tenantId: "t-alger", orderNumber: "CMD-1039", status: "completed", type: "dine_in", waiterName: "Yacine", totalGross: 3200, discountAmount: 0, paymentMethod: "cash", createdAt: hoursAgo(2), lines: [
    { id: "l-6", productName: "Poulet rôti au feu", variantName: "Entier", qty: 2, unitPrice: 1100 },
    { id: "l-7", productName: "Thé à la menthe", variantName: null, qty: 5, unitPrice: 200 },
  ] }),
  o({ id: "o-1038", tenantId: "t-alger", orderNumber: "CMD-1038", status: "completed", type: "takeaway", waiterName: "Amine", totalGross: 950, discountAmount: 0, paymentMethod: "cib_card", createdAt: hoursAgo(3), lines: [
    { id: "l-8", productName: "Couscous royal", variantName: "Poulet", qty: 1, unitPrice: 950 },
  ] }),
  o({ id: "o-1037", tenantId: "t-alger", orderNumber: "CMD-1037", status: "completed", type: "dine_in", waiterName: "Sara", totalGross: 2100, discountAmount: 200, paymentMethod: "edahabia", createdAt: hoursAgo(4), lines: [
    { id: "l-9", productName: "Assiette mixte", variantName: null, qty: 1, unitPrice: 1400 },
    { id: "l-10", productName: "Mhalbi", variantName: null, qty: 2, unitPrice: 300 },
    { id: "l-11", productName: "Jus d'orange pressé", variantName: null, qty: 1, unitPrice: 300 },
  ] }),
  o({ id: "o-1036", tenantId: "t-alger", orderNumber: "CMD-1036", status: "void", type: "dine_in", waiterName: "Yacine", totalGross: 800, discountAmount: 0, paymentMethod: null, createdAt: hoursAgo(5), lines: [
    { id: "l-12", productName: "Rechta algéroise", variantName: null, qty: 1, unitPrice: 800 },
  ] }),
  o({ id: "o-1035", tenantId: "t-alger", orderNumber: "CMD-1035", status: "completed", type: "delivery", waiterName: null, totalGross: 1900, discountAmount: 0, paymentMethod: "cash", createdAt: hoursAgo(6), lines: [
    { id: "l-13", productName: "Tajine zitoune", variantName: null, qty: 1, unitPrice: 900 },
    { id: "l-14", productName: "Loubia", variantName: null, qty: 2, unitPrice: 500 },
  ] }),
  o({ id: "o-1034", tenantId: "t-alger", orderNumber: "CMD-1034", status: "completed", type: "dine_in", waiterName: "Sara", totalGross: 1350, discountAmount: 0, paymentMethod: "cash", createdAt: daysAgo(1, 13), lines: [
    { id: "l-15", productName: "Chorba frik", variantName: null, qty: 2, unitPrice: 350 },
    { id: "l-16", productName: "Makroud (x4)", variantName: null, qty: 2, unitPrice: 350 },
  ] }),
  o({ id: "o-1033", tenantId: "t-alger", orderNumber: "CMD-1033", status: "completed", type: "takeaway", waiterName: "Amine", totalGross: 2800, discountAmount: 150, paymentMethod: "cib_card", createdAt: daysAgo(1, 19), lines: [
    { id: "l-17", productName: "Assiette mixte", variantName: null, qty: 2, unitPrice: 1400 },
  ] }),
  o({ id: "o-1032", tenantId: "t-alger", orderNumber: "CMD-1032", status: "completed", type: "dine_in", waiterName: "Yacine", totalGross: 1750, discountAmount: 0, paymentMethod: "cash", createdAt: daysAgo(2, 13), lines: [
    { id: "l-18", productName: "Couscous royal", variantName: "Merguez", qty: 1, unitPrice: 1100 },
    { id: "l-19", productName: "Bourek annabi (x3)", variantName: null, qty: 1, unitPrice: 450 },
    { id: "l-20", productName: "Thé à la menthe", variantName: null, qty: 1, unitPrice: 200 },
  ] }),
  o({ id: "o-1031", tenantId: "t-alger", orderNumber: "CMD-1031", status: "completed", type: "delivery", waiterName: null, totalGross: 2400, discountAmount: 0, paymentMethod: "edahabia", createdAt: daysAgo(2, 20), lines: [
    { id: "l-21", productName: "Poulet rôti au feu", variantName: "Entier", qty: 2, unitPrice: 1100 },
    { id: "l-22", productName: "Eau minérale 50cl", variantName: null, qty: 2, unitPrice: 150 },
  ] }),
  o({ id: "o-1030", tenantId: "t-alger", orderNumber: "CMD-1030", status: "completed", type: "dine_in", waiterName: "Sara", totalGross: 1100, discountAmount: 0, paymentMethod: "qr", createdAt: daysAgo(3, 12), lines: [
    { id: "l-23", productName: "Rechta algéroise", variantName: null, qty: 1, unitPrice: 800 },
    { id: "l-24", productName: "Mhalbi", variantName: null, qty: 1, unitPrice: 300 },
  ] }),
  o({ id: "o-1029", tenantId: "t-alger", orderNumber: "CMD-1029", status: "completed", type: "takeaway", waiterName: "Amine", totalGross: 900, discountAmount: 0, paymentMethod: "cash", createdAt: daysAgo(4, 18), lines: [
    { id: "l-25", productName: "Chakhchoukha", variantName: null, qty: 1, unitPrice: 850 },
  ] }),
  o({ id: "o-1028", tenantId: "t-alger", orderNumber: "CMD-1028", status: "completed", type: "dine_in", waiterName: "Yacine", totalGross: 3600, discountAmount: 300, paymentMethod: "cash", createdAt: daysAgo(5, 13), lines: [
    { id: "l-26", productName: "Assiette mixte", variantName: null, qty: 2, unitPrice: 1400 },
    { id: "l-27", productName: "Chorba frik", variantName: null, qty: 2, unitPrice: 350 },
  ] }),
  o({ id: "o-1027", tenantId: "t-alger", orderNumber: "CMD-1027", status: "completed", type: "dine_in", waiterName: "Sara", totalGross: 1500, discountAmount: 0, paymentMethod: "cib_card", createdAt: daysAgo(6, 19), lines: [
    { id: "l-28", productName: "Loubia", variantName: null, qty: 3, unitPrice: 500 },
  ] }),
];

export const DEMO_ONLINE_ORDERS: OnlineOrder[] = [
  {
    id: "oo-501", tenantId: "t-alger", orderNumber: "WEB-501",
    customerName: "Lina Benali", customerPhone: "+213 555 11 22 33",
    wilaya: "Alger", commune: "Hydra", address: "Rue des Frères Bouadou",
    shippingStatus: "preparing", paymentStatus: "paid", paymentMethod: "cib_card",
    subtotal: 1900, deliveryFee: 400, total: 2300, trackingNumber: null,
    note: "Sans coriandre.", createdAt: minutesAgo(55),
    items: [
      { id: "oi-1", productName: "Couscous royal", variantName: "Poulet", qty: 2, unitPrice: 950 },
    ],
  },
  {
    id: "oo-500", tenantId: "t-alger", orderNumber: "WEB-500",
    customerName: "Karim Haddad", customerPhone: "+213 777 44 55 66",
    wilaya: "Alger", commune: "Bab Ezzouar", address: "Cité 1200 logts, Bt 4",
    shippingStatus: "shipped", paymentStatus: "paid", paymentMethod: "edahabia",
    subtotal: 1400, deliveryFee: 500, total: 1900, trackingNumber: "TRK-88231",
    note: null, createdAt: hoursAgo(3),
    items: [
      { id: "oi-2", productName: "Assiette mixte", variantName: null, qty: 1, unitPrice: 1400 },
    ],
  },
  {
    id: "oo-499", tenantId: "t-alger", orderNumber: "WEB-499",
    customerName: "Sara Mansouri", customerPhone: "+213 660 12 98 76",
    wilaya: "Blida", commune: "Boufarik", address: null,
    shippingStatus: "pending", paymentStatus: "pending", paymentMethod: "cash",
    subtotal: 1150, deliveryFee: 600, total: 1750, trackingNumber: null,
    note: "Paiement à la livraison.", createdAt: hoursAgo(5),
    items: [
      { id: "oi-3", productName: "Rechta algéroise", variantName: null, qty: 1, unitPrice: 800 },
      { id: "oi-4", productName: "Makroud (x4)", variantName: null, qty: 1, unitPrice: 350 },
    ],
  },
  {
    id: "oo-498", tenantId: "t-alger", orderNumber: "WEB-498",
    customerName: "Mohamed Ziani", customerPhone: "+213 551 23 45 67",
    wilaya: "Alger", commune: "Draria", address: "Lotissement El Badr",
    shippingStatus: "delivered", paymentStatus: "paid", paymentMethod: "cash",
    subtotal: 2200, deliveryFee: 400, total: 2600, trackingNumber: "TRK-87902",
    note: null, createdAt: daysAgo(1, 12),
    items: [
      { id: "oi-5", productName: "Poulet rôti au feu", variantName: "Entier", qty: 2, unitPrice: 1100 },
    ],
  },
  {
    id: "oo-497", tenantId: "t-alger", orderNumber: "WEB-497",
    customerName: "Amina Kaci", customerPhone: "+213 662 34 56 78",
    wilaya: "Tipaza", commune: "Kolea", address: null,
    shippingStatus: "cancelled", paymentStatus: "refunded", paymentMethod: "cib_card",
    subtotal: 950, deliveryFee: 700, total: 1650, trackingNumber: null,
    note: "Cliente injoignable.", createdAt: daysAgo(2, 17),
    items: [
      { id: "oi-6", productName: "Couscous royal", variantName: "Viande", qty: 1, unitPrice: 1200 },
    ],
  },
];
