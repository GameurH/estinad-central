"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  ImageOff,
  Plus,
  Search,
  Trash2,
  XCircle,
  X,
} from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
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
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/states";
import {
  bulkDeleteProducts,
  bulkMoveProductsToCategory,
  bulkSetProductsAvailability,
  getCategories,
  getProductName,
  getProducts,
  missingTranslationLangs,
  type ProductListItem,
} from "@/lib/services";
import { formatCurrency } from "@/lib/format";
import type { Category } from "@/lib/domain";

const PAGE_SIZE = 12;

/** Replaces `{n}` in a template translation key. */
function tpl(key: string, n: number): string {
  return key.replace("{n}", String(n));
}

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
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [avail, setAvail] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [query, categoryId, avail]);

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

  /* ---------- Bulk selection & actions ---------- */

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const pageIds = pageItems.map((p) => p.id);
      const allOnPage = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const runBulk = async (fn: () => Promise<void>, doneKey: string) => {
    if (!current || selected.size === 0) return;
    setBusy(true);
    try {
      await fn();
      toast(t(doneKey));
      clearSelection();
      load();
    } catch {
      toast(t("error_title"), "error");
      load();
    } finally {
      setBusy(false);
    }
  };

  const setAvailability = (available: boolean) =>
    runBulk(
      () => bulkSetProductsAvailability(current!.id, [...selected], available),
      available ? "bulk_available_done" : "bulk_unavailable_done",
    );

  const submitMove = () =>
    runBulk(
      () =>
        bulkMoveProductsToCategory(
          current!.id,
          [...selected],
          moveTarget || null,
        ),
      "bulk_move_done",
    ).finally(() => setMoveOpen(false));

  /**
   * Delete keeps the selection visible in the confirm dialog, then reports the
   * per-item outcome: some rows may be blocked by order references (FK), and
   * the merchant should see exactly what happened.
   */
  const submitDelete = async () => {
    if (!current) return;
    setBusy(true);
    setDeleteOpen(false);
    try {
      const { deleted, blocked } = await bulkDeleteProducts(current.id, [...selected]);
      if (deleted.length > 0) toast(tpl(t("bulk_delete_done"), deleted.length));
      if (blocked.length > 0) toast(tpl(t("bulk_delete_blocked"), blocked.length), "error");
      clearSelection();
      load();
    } catch {
      toast(t("error_title"), "error");
      load();
    } finally {
      setBusy(false);
    }
  };

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
          {selected.size > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-accent-muted px-3.5 py-2.5"
              role="toolbar"
              aria-label={t("bulk_actions")}
            >
              <span className="tnum text-[13px] font-medium text-text-primary">
                {tpl(t("bulk_selected_count"), selected.size)}
              </span>
              <span className="hidden h-4 w-px bg-border sm:block" />
              <Button
                size="sm"
                icon={<CheckCircle2 className="h-4 w-4" />}
                disabled={busy}
                onClick={() => setAvailability(true)}
              >
                {t("bulk_set_available")}
              </Button>
              <Button
                size="sm"
                icon={<XCircle className="h-4 w-4" />}
                disabled={busy}
                onClick={() => setAvailability(false)}
              >
                {t("bulk_set_unavailable")}
              </Button>
              <Button
                size="sm"
                icon={<ArrowRightLeft className="h-4 w-4" />}
                disabled={busy || categories.length === 0}
                onClick={() => {
                  setMoveTarget("");
                  setMoveOpen(true);
                }}
              >
                {t("bulk_move_to_category")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                {t("delete")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<X className="h-4 w-4" />}
                disabled={busy}
                onClick={clearSelection}
                aria-label={t("bulk_clear")}
              >
                {t("bulk_clear")}
              </Button>
            </div>
          )}
          <DataTable
            columns={columns}
            rows={pageItems}
            selectable
            selectedIds={selected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAllOnPage}
            onRowClick={(p) => {
              if (selected.size > 0) toggleRow(p.id);
              else router.push(`/products/${p.id}`);
            }}
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

      <Dialog
        open={moveOpen}
        onClose={() => !busy && setMoveOpen(false)}
        title={t("bulk_move_to_category")}
        description={t("bulk_move_body")}
      >
        <div className="space-y-4">
          <Select
            value={moveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
            aria-label={t("category")}
          >
            <option value="">{t("all_categories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMoveOpen(false)}>{t("cancel")}</Button>
            <Button
              variant="primary"
              disabled={!moveTarget || busy}
              loading={busy}
              onClick={submitMove}
            >
              {t("bulk_move_to_category")}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        onConfirm={submitDelete}
        title={tpl(t("bulk_delete_title"), selected.size)}
        body={t("bulk_delete_body")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        loading={busy}
      />
    </div>
  );
}
