"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ImageOff } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import {
  DataTable,
  RowPrimary,
  RowSecondary,
  type Column,
} from "@/components/patterns/data-table";
import { AvailabilityBadge } from "@/components/patterns/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/states";
import {
  getCategories,
  getProductName,
  getProducts,
  missingTranslationLangs,
  type ProductListItem,
} from "@/lib/services";
import { formatCurrency } from "@/lib/format";
import type { Category } from "@/lib/domain";

const PAGE_SIZE = 12;

/**
 * Row thumbnail.
 *
 * A plain `<img>`, not `next/image`: URLs come from the gallery *and* from
 * legacy/foreign hosts, and `next/image` throws for a host that is not listed
 * in `images.remotePatterns` — one pasted URL would blank the whole list.
 */
function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-inset">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see note above
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-4 w-4 text-text-muted" aria-hidden />
      )}
    </span>
  );
}

export default function ProductsPage() {
  const { current } = useTenant();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [avail, setAvail] = useState("all");
  const [page, setPage] = useState(0);

  const load = () => {
    if (!current) return;
    setLoading(true);
    setFailed(false);
    Promise.all([getProducts(current.id), getCategories(current.id)])
      .then(([p, c]) => {
        setItems(p);
        setCategories(c);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [current]);

  useEffect(() => setPage(0), [query, categoryId, avail]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (categoryId !== "all" && p.categoryId !== categoryId) return false;
      if (avail === "available" && !p.isAvailable) return false;
      if (avail === "unavailable" && p.isAvailable) return false;
      if (q && !`${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, categoryId, avail]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const columns: Column<ProductListItem>[] = [
    {
      key: "name",
      header: t("name"),
      render: (p) => (
        <span className="flex items-center gap-3">
          <ProductThumb src={p.image} alt={getProductName(p, lang)} />
          <span className="min-w-0">
            <RowPrimary>{getProductName(p, lang)}</RowPrimary>
            <br />
            <RowSecondary>
              <span className="text-xs">
                {p.sku ?? "—"}
                {missingTranslationLangs("product", p.id).length > 0 && (
                  <span className="ms-1.5 rounded bg-warning-muted px-1 py-px text-[10px] font-medium text-warning">
                    FR+
                  </span>
                )}
              </span>
            </RowSecondary>
          </span>
        </span>
      ),
    },
    {
      key: "category",
      header: t("category"),
      render: (p) => <RowSecondary>{p.categoryName ?? "—"}</RowSecondary>,
    },
    {
      key: "price",
      header: t("price"),
      className: "text-end",
      render: (p) => (
        <span className="tnum font-semibold text-text-primary">
          {formatCurrency(p.price)}
        </span>
      ),
    },
    {
      key: "type",
      header: t("type"),
      render: (p) => (
        <Badge>
          {t(p.type)}
          {p.variantCount > 0 && ` · ${p.variantCount}`}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (p) => <AvailabilityBadge available={p.isAvailable} />,
    },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("products")}
        subtitle={`${filtered.length} ${t("products_count")}`}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => router.push("/products/new")}
          >
            {t("add_product")}
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 start-3 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search_products")}
            aria-label={t("search")}
            className="ps-9"
          />
        </div>
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label={t("category")}
          className="sm:w-48"
        >
          <option value="all">{t("all_categories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={avail}
          onChange={(e) => setAvail(e.target.value)}
          aria-label={t("status")}
          className="sm:w-40"
        >
          <option value="all">{t("all_statuses")}</option>
          <option value="available">{t("available")}</option>
          <option value="unavailable">{t("unavailable")}</option>
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : failed ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <ErrorState title={t("error_title")} onRetry={load} retryLabel={t("retry")} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <EmptyState
            title={t("empty_products")}
            hint={t("empty_products_hint")}
            action={
              <Button variant="primary" size="sm" onClick={() => router.push("/products/new")}>
                {t("add_product")}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={pageItems}
            onRowClick={(p) => router.push(`/products/${p.id}`)}
            empty={
              <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
                <NoResultsState
                  title={t("no_results")}
                  hint={t("no_results_hint")}
                  clearLabel={t("clear_filters")}
                  onClear={() => {
                    setQuery("");
                    setCategoryId("all");
                    setAvail("all");
                  }}
                />
              </div>
            }
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[13px] text-text-secondary">
              <span className="tnum">
                Page {page + 1} / {totalPages} · {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  {t("back")}
                </Button>
                <Button
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
