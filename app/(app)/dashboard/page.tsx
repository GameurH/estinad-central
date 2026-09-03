"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  ShoppingCart,
  Receipt,
  CircleCheck,
  ArrowRight,
  Clock3,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { CardsSkeleton, Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { OrderStatusBadge } from "@/components/patterns/status";
import {
  getDashboardSummary,
  getHourlySales,
  getOrders,
  getTopProducts,
  trialDaysLeft,
} from "@/lib/services";
import { formatCurrency, formatHour, timeAgo } from "@/lib/format";
import type {
  DashboardSummary,
  HourlySales,
  Order,
  ProductPerformance,
} from "@/lib/domain";
import { Badge } from "@/components/ui/badge";

function useDashboardData(tenantId: string | null) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [hourly, setHourly] = useState<HourlySales[]>([]);
  const [top, setTop] = useState<ProductPerformance[]>([]);
  const [recent, setRecent] = useState<Order[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setStatus("loading");
    try {
      const [s, h, tp, orders] = await Promise.all([
        getDashboardSummary(tenantId),
        getHourlySales(tenantId),
        getTopProducts(tenantId),
        getOrders(tenantId),
      ]);
      setSummary(s);
      setHourly(h);
      setTop(tp);
      setRecent(orders.slice(0, 5));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, hourly, top, recent, status, reload: load };
}

export default function DashboardPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const { summary, hourly, top, recent, status, reload } = useDashboardData(
    current?.id ?? null,
  );
  const days = current ? trialDaysLeft(current) : null;

  if (!current) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("dashboard")} />
        <CardsSkeleton />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title={t("dashboard")}
        subtitle={current.name}
        actions={
          days !== null ? (
            <Badge tone="info">
              {days} {t("trial_days_left")}
            </Badge>
          ) : undefined
        }
      />

      {status === "loading" && (
        <>
          <CardsSkeleton />
          <Skeleton className="h-64 w-full" />
        </>
      )}

      {status === "error" && (
        <Card>
          <ErrorState title={t("error_title")} onRetry={reload} retryLabel={t("retry")} />
        </Card>
      )}

      {status === "ready" && summary && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("revenue")}
              value={formatCurrency(summary.revenueToday)}
              delta={summary.revenueDelta}
              deltaSuffix="%"
              icon={Banknote}
              hint={t("today")}
            />
            <StatCard
              label={t("orders_today")}
              value={String(summary.ordersToday)}
              delta={summary.ordersDelta}
              icon={ShoppingCart}
              hint={t("today")}
            />
            <StatCard
              label={t("avg_ticket")}
              value={formatCurrency(summary.avgOrderValue)}
              icon={Receipt}
            />
            <StatCard
              label={t("completion")}
              value={`${summary.completionRate}%`}
              icon={CircleCheck}
              hint={`${summary.activeOrders} ${t("active_orders").toLowerCase()}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title={t("hourly_revenue")} />
              <div className="h-64 px-2 py-3" dir="ltr">
                {hourly.length === 0 ? (
                  <EmptyState title={t("empty_orders")} hint={t("empty_orders_hint")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourly} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(h: number) => formatHour(h)}
                        tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={32}
                      />
                      <YAxis
                        width={64}
                        tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 12,
                        }}
                        labelFormatter={(h) => formatHour(Number(h))}
                        formatter={(value) => [formatCurrency(Number(value ?? 0)), t("revenue")]}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        fill="var(--accent-muted)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                title={t("top_products")}
                action={
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    {t("view_all")}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                }
              />
              <ol className="divide-y divide-[var(--border)]">
                {top.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3 px-4 py-3">
                    <span className="tnum w-5 shrink-0 text-center text-xs font-semibold text-text-muted">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text-primary">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {p.totalQuantity} × · {p.categoryName ?? "—"}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[13px] font-semibold text-text-primary">
                      {formatCurrency(p.totalRevenue)}
                    </span>
                  </li>
                ))}
                {top.length === 0 && (
                  <li className="px-4 py-8 text-center text-[13px] text-text-muted">
                    {t("empty_orders_hint")}
                  </li>
                )}
              </ol>
            </Card>
          </div>

          <Card>
            <CardHeader
              title={t("recent_orders")}
              action={
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  {t("view_all")}
                  <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState title={t("empty_orders")} hint={t("empty_orders_hint")} />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((o) => (
                  <li key={o.id}>
                    <Link
                      href="/orders"
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-surface/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="tnum block text-[13px] font-medium text-text-primary">
                          {o.orderNumber}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock3 className="h-3 w-3" />
                          {timeAgo(o.createdAt)}
                          {o.waiterName ? ` · ${o.waiterName}` : ""}
                        </span>
                      </span>
                      <OrderStatusBadge status={o.status} />
                      <span className="tnum w-24 shrink-0 text-end text-[13px] font-semibold text-text-primary">
                        {formatCurrency(o.totalGross - o.discountAmount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
