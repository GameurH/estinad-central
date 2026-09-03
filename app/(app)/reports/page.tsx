"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { DataTable, type Column } from "@/components/patterns/data-table";
import { paymentMethodLabel } from "@/components/patterns/status";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/fields";
import { CardsSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Banknote, Receipt, ShoppingCart } from "lucide-react";
import {
  downloadCsv,
  getDailySales,
  getPaymentBreakdown,
  toCsv,
} from "@/lib/services";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DailySales, PaymentMethod } from "@/lib/domain";

const PIE_COLORS = ["#5e6ad2", "#10b981", "#f59e0b", "#3b82f6", "#ef4444"];

export default function ReportsPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const [range, setRange] = useState("7");
  const [daily, setDaily] = useState<DailySales[]>([]);
  const [payments, setPayments] = useState<
    { method: PaymentMethod; paymentCount: number; totalAmount: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    Promise.all([
      getDailySales(current.id, Number(range)),
      getPaymentBreakdown(current.id),
    ])
      .then(([d, p]) => {
        setDaily(d);
        setPayments(p);
      })
      .finally(() => setLoading(false));
  }, [current, range]);

  const totals = useMemo(() => {
    const revenue = daily.reduce((s, d) => s + d.completedRevenue, 0);
    const orders = daily.reduce((s, d) => s + d.completedCount, 0);
    return {
      revenue,
      orders,
      avg: orders > 0 ? Math.round(revenue / orders) : 0,
    };
  }, [daily]);

  const pieData = payments.map((p) => ({ name: paymentMethodLabel(p.method), value: p.totalAmount }));

  const columns: Column<DailySales>[] = [
    {
      key: "date",
      header: t("date"),
      render: (d) => <span className="font-medium text-text-primary">{formatDate(d.date)}</span>,
    },
    {
      key: "orders",
      header: t("orders"),
      className: "text-end",
      render: (d) => <span className="tnum text-text-secondary">{d.completedCount}</span>,
    },
    {
      key: "revenue",
      header: t("revenue"),
      className: "text-end",
      render: (d) => (
        <span className="tnum font-semibold text-text-primary">
          {formatCurrency(d.completedRevenue)}
        </span>
      ),
    },
    {
      key: "avg",
      header: t("avg_ticket"),
      className: "text-end",
      render: (d) => (
        <span className="tnum text-text-secondary">{formatCurrency(d.avgOrderValue)}</span>
      ),
    },
  ];

  const exportAll = () => {
    const csv = toCsv(
      ["date", "orders", "revenue", "avg_ticket"],
      daily.map((d) => [d.date.slice(0, 10), d.completedCount, d.completedRevenue, d.avgOrderValue]),
    );
    downloadCsv(`rapports-${range}j.csv`, csv);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("reports")}
        actions={
          <>
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Période"
              className="w-44"
            >
              <option value="7">{t("last_7_days")}</option>
              <option value="30">{t("last_30_days")}</option>
            </Select>
            <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={exportAll}>
              {t("export_csv")}
            </Button>
          </>
        }
      />

      {loading ? (
        <>
          <CardsSkeleton count={3} />
          <Skeleton className="h-64 w-full" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={t("revenue")} value={formatCurrency(totals.revenue)} icon={Banknote} />
            <StatCard label={t("orders")} value={String(totals.orders)} icon={ShoppingCart} />
            <StatCard label={t("avg_ticket")} value={formatCurrency(totals.avg)} icon={Receipt} />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title={t("daily_revenue")} />
              <div className="h-64 px-2 py-3" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) =>
                        new Date(d).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short" })
                      }
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      width={64}
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 12,
                      }}
                      labelFormatter={(d) => formatDate(String(d))}
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), t("revenue")]}
                    />
                    <Bar dataKey="completedRevenue" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader title={t("payment_methods")} />
              <div className="flex h-64 items-center justify-center px-4 py-3" dir="ltr">
                {pieData.length === 0 ? (
                  <p className="text-[13px] text-text-muted">{t("no_results")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 12,
                        }}
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <ul className="space-y-1.5 px-4 pb-4">
                {payments.map((p, i) => (
                  <li key={p.method} className="flex items-center gap-2 text-[13px]">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="flex-1 text-text-secondary">
                      {paymentMethodLabel(p.method)}
                    </span>
                    <span className="tnum font-medium text-text-primary">
                      {formatCurrency(p.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-text-primary">{t("breakdown")}</h2>
            <DataTable columns={columns} rows={daily} getRowId={(d) => d.date} />
          </div>
        </>
      )}
    </div>
  );
}
