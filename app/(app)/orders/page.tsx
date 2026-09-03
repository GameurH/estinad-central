"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import {
  DataTable,
  RowPrimary,
  RowSecondary,
  type Column,
} from "@/components/patterns/data-table";
import {
  OrderStatusBadge,
  OrderTypeBadge,
  PaymentMethodLabel,
} from "@/components/patterns/status";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/states";
import { downloadCsv, getOrders, toCsv } from "@/lib/services";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/domain";

const STATUSES: OrderStatus[] = [
  "draft",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "void",
];

const STATUS_FR: Record<OrderStatus, string> = {
  draft: "Brouillon",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  completed: "Terminée",
  void: "Annulée",
};

const PAGE_SIZE = 12;

export default function OrdersPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [page, setPage] = useState(0);

  const load = () => {
    if (!current) return;
    setLoading(true);
    setFailed(false);
    getOrders(current.id)
      .then(setOrders)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [current]);

  useEffect(() => setPage(0), [query, status]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (
        q &&
        !`${o.orderNumber} ${o.waiterName ?? ""}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [orders, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const columns: Column<Order>[] = [
    {
      key: "number",
      header: t("orders"),
      render: (o) => (
        <span>
          <RowPrimary>
            <span className="tnum">{o.orderNumber}</span>
          </RowPrimary>
          <br />
          <RowSecondary>
            <span className="text-xs">
              {formatDateTime(o.createdAt)}
              {o.waiterName ? ` · ${o.waiterName}` : ""}
            </span>
          </RowSecondary>
        </span>
      ),
    },
    { key: "type", header: t("type"), render: (o) => <OrderTypeBadge type={o.type} /> },
    { key: "status", header: t("status"), render: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: "payment",
      header: t("payment"),
      render: (o) =>
        o.paymentMethod ? <PaymentMethodLabel method={o.paymentMethod} /> : <RowSecondary>—</RowSecondary>,
    },
    {
      key: "total",
      header: t("total"),
      className: "text-end",
      render: (o) => (
        <span className="tnum font-semibold text-text-primary">
          {formatCurrency(o.totalGross - o.discountAmount)}
        </span>
      ),
    },
  ];

  const exportAll = () => {
    const csv = toCsv(
      ["number", "date", "type", "status", "waiter", "total"],
      filtered.map((o) => [
        o.orderNumber,
        o.createdAt,
        o.type,
        o.status,
        o.waiterName ?? "",
        o.totalGross - o.discountAmount,
      ]),
    );
    downloadCsv("orders.csv", csv);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("orders")}
        subtitle={`${filtered.length} · POS`}
        actions={
          <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={exportAll}>
            {t("export_csv")}
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 start-3 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search_orders")}
            aria-label={t("search")}
            className="ps-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t("status")}
          className="sm:w-48"
        >
          <option value="all">{t("all_statuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_FR[s]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : failed ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <ErrorState title={t("error_title")} onRetry={load} retryLabel={t("retry")} />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <EmptyState title={t("empty_orders")} hint={t("empty_orders_hint")} />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={pageItems}
            onRowClick={setSelected}
            empty={
              <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
                <NoResultsState
                  title={t("no_results")}
                  hint={t("no_results_hint")}
                  clearLabel={t("clear_filters")}
                  onClear={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                />
              </div>
            }
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[13px] text-text-secondary">
              <span className="tnum">
                Page {page + 1} / {totalPages}
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
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Commande ${selected.orderNumber}` : ""}
        wide
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <OrderStatusBadge status={selected.status} />
              <OrderTypeBadge type={selected.type} />
              {selected.paymentMethod && (
                <PaymentMethodLabel method={selected.paymentMethod} />
              )}
            </div>
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-border">
              {selected.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text-primary">
                      {l.productName}
                      {l.variantName ? ` · ${l.variantName}` : ""}
                    </span>
                    <span className="tnum text-xs text-text-muted">
                      {l.qty} × {formatCurrency(l.unitPrice)}
                    </span>
                  </span>
                  <span className="tnum font-semibold text-text-primary">
                    {formatCurrency(l.qty * l.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 text-[13px]">
              {selected.discountAmount > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <dt>Remise</dt>
                  <dd className="tnum">−{formatCurrency(selected.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-text-primary">
                <dt>{t("total")}</dt>
                <dd className="tnum">
                  {formatCurrency(selected.totalGross - selected.discountAmount)}
                </dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setSelected(null)}>
                {t("close")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
