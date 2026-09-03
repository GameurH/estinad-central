"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
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
import {
  PaymentMethodLabel,
  PaymentStatusBadge,
  ShippingStatusBadge,
} from "@/components/patterns/status";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, NoResultsState } from "@/components/ui/states";
import { downloadCsv, getOnlineOrders, toCsv } from "@/lib/services";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { OnlineOrder, ShippingStatus } from "@/lib/domain";

const SHIPPING: ShippingStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

const SHIPPING_FR: Record<ShippingStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export default function OnlineOrdersPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [shipping, setShipping] = useState("all");
  const [selected, setSelected] = useState<OnlineOrder | null>(null);
  const [tracking, setTracking] = useState("");

  useEffect(() => {
    if (!current) return;
    getOnlineOrders(current.id)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [current]);

  useEffect(() => {
    setTracking(selected?.trackingNumber ?? "");
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (shipping !== "all" && o.shippingStatus !== shipping) return false;
      if (
        q &&
        !`${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.wilaya} ${o.commune}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [orders, query, shipping]);

  const updateStatus = (status: ShippingStatus) => {
    if (!selected) return;
    setOrders((list) =>
      list.map((o) =>
        o.id === selected.id
          ? {
              ...o,
              shippingStatus: status,
              trackingNumber: tracking.trim() || o.trackingNumber,
            }
          : o,
      ),
    );
    setSelected((s) =>
      s
        ? {
            ...s,
            shippingStatus: status,
            trackingNumber: tracking.trim() || s.trackingNumber,
          }
        : s,
    );
    toast(t("saved"));
  };

  const columns: Column<OnlineOrder>[] = [
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
              {o.customerName} · {formatDateTime(o.createdAt)}
            </span>
          </RowSecondary>
        </span>
      ),
    },
    {
      key: "dest",
      header: `${t("wilaya")} / ${t("commune")}`,
      render: (o) => (
        <RowSecondary>
          {o.wilaya} · {o.commune}
        </RowSecondary>
      ),
    },
    {
      key: "shipping",
      header: t("shipping"),
      render: (o) => <ShippingStatusBadge status={o.shippingStatus} />,
    },
    {
      key: "payment",
      header: t("payment"),
      render: (o) => (
        <span className="flex items-center gap-2">
          <PaymentStatusBadge status={o.paymentStatus} />
          <PaymentMethodLabel method={o.paymentMethod} />
        </span>
      ),
    },
    {
      key: "total",
      header: t("total"),
      className: "text-end",
      render: (o) => (
        <span className="tnum font-semibold text-text-primary">
          {formatCurrency(o.total)}
        </span>
      ),
    },
  ];

  const exportAll = () => {
    const csv = toCsv(
      ["number", "date", "customer", "phone", "wilaya", "shipping", "payment", "total"],
      filtered.map((o) => [
        o.orderNumber,
        o.createdAt,
        o.customerName,
        o.customerPhone,
        `${o.wilaya}/${o.commune}`,
        o.shippingStatus,
        o.paymentStatus,
        o.total,
      ]),
    );
    downloadCsv("online-orders.csv", csv);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("online_orders")}
        subtitle={`${filtered.length} · boutique`}
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
          value={shipping}
          onChange={(e) => setShipping(e.target.value)}
          aria-label={t("shipping")}
          className="sm:w-48"
        >
          <option value="all">{t("all_statuses")}</option>
          {SHIPPING.map((s) => (
            <option key={s} value={s}>
              {SHIPPING_FR[s]}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : orders.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <EmptyState
            title={t("empty_online_orders")}
            hint={t("empty_online_orders_hint")}
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          onRowClick={setSelected}
          empty={
            <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
              <NoResultsState
                title={t("no_results")}
                hint={t("no_results_hint")}
                clearLabel={t("clear_filters")}
                onClear={() => {
                  setQuery("");
                  setShipping("all");
                }}
              />
            </div>
          }
        />
      )}

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Commande ${selected.orderNumber}` : ""}
        wide
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-border p-3">
                <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                  {t("customer")}
                </p>
                <p className="mt-1 text-[13px] font-medium text-text-primary">
                  {selected.customerName}
                </p>
                <p className="tnum text-xs text-text-secondary">{selected.customerPhone}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {selected.address ? `${selected.address}, ` : ""}
                  {selected.commune}, {selected.wilaya}
                </p>
                {selected.note && (
                  <p className="mt-1.5 rounded bg-warning-muted px-2 py-1 text-xs text-warning">
                    {selected.note}
                  </p>
                )}
              </div>
              <div className="rounded-[var(--radius-md)] border border-border p-3">
                <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                  {t("shipping")}
                </p>
                <div className="mt-1.5">
                  <ShippingStatusBadge status={selected.shippingStatus} />
                </div>
                <div className="mt-2">
                  <Field label={t("tracking_number")}>
                    <Input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      placeholder="TRK-…"
                      className="font-mono"
                    />
                  </Field>
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border p-3">
                <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                  {t("payment")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <PaymentStatusBadge status={selected.paymentStatus} />
                  <PaymentMethodLabel method={selected.paymentMethod} />
                </div>
                <dl className="mt-2 space-y-1 text-[13px]">
                  <div className="flex justify-between text-text-secondary">
                    <dt>{t("subtotal")}</dt>
                    <dd className="tnum">{formatCurrency(selected.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <dt>{t("delivery")}</dt>
                    <dd className="tnum">{formatCurrency(selected.deliveryFee)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-semibold text-text-primary">
                    <dt>{t("total")}</dt>
                    <dd className="tnum">{formatCurrency(selected.total)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-border">
              {selected.items.map((l) => (
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

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" onClick={() => updateStatus("shipped")}>
                {t("mark_shipped")}
              </Button>
              <Button size="sm" variant="primary" onClick={() => updateStatus("delivered")}>
                {t("mark_delivered")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
