"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  applyDeliveryFeeToAllWilayas,
  createShippingMethod,
  deleteShippingMethod,
  getDeliveryZones,
  getShippingMethods,
  getWilayas,
  reorderShippingMethods,
  updateShippingMethod,
  upsertDeliveryZone,
} from "@/lib/services";
import type { ShippingMethod, ShippingMethodType, Wilaya } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<ShippingMethodType, "accent" | "info" | "success"> = {
  home: "accent",
  desk: "info",
  pickup: "success",
};

interface MethodDraft {
  id?: string;
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  type: ShippingMethodType;
  provider: string;
  basePrice: string;
  freeOverThreshold: string;
  estimatedDaysMin: string;
  estimatedDaysMax: string;
  isActive: boolean;
}

function emptyDraft(): MethodDraft {
  return {
    code: "",
    nameFr: "",
    nameAr: "",
    nameEn: "",
    type: "home",
    provider: "",
    basePrice: "0",
    freeOverThreshold: "",
    estimatedDaysMin: "",
    estimatedDaysMax: "",
    isActive: true,
  };
}

function draftFromMethod(m: ShippingMethod): MethodDraft {
  return {
    id: m.id,
    code: m.code,
    nameFr: m.nameFr,
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    type: m.type,
    provider: m.provider,
    basePrice: String(m.basePrice),
    freeOverThreshold: m.freeOverThreshold == null ? "" : String(m.freeOverThreshold),
    estimatedDaysMin: m.estimatedDaysMin == null ? "" : String(m.estimatedDaysMin),
    estimatedDaysMax: m.estimatedDaysMax == null ? "" : String(m.estimatedDaysMax),
    isActive: m.isActive,
  };
}

function numOrError(value: string, label: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(label);
  return n;
}

export default function ShippingPage() {
  const { current } = useTenant();
  const { t } = useLanguage();
  const { toast } = useToast();

  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [zones, setZones] = useState<Record<string, { fee: number; isActive: boolean }>>(
    {},
  );
  const [feeKeys, setFeeKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<MethodDraft | null>(null);
  const [deleting, setDeleting] = useState<ShippingMethod | null>(null);
  const [bulk, setBulk] = useState<{ method: ShippingMethod; fee: number } | null>(null);

  const load = () => {
    if (!current) return;
    setLoading(true);
    setFailed(false);
    Promise.all([
      getShippingMethods(current.id),
      getWilayas(),
      getDeliveryZones(current.id),
    ])
      .then(([m, w, z]) => {
        setMethods(m.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.nameFr.localeCompare(b.nameFr)));
        setWilayas(w);
        setZones(
          Object.fromEntries(
            z.map((zone) => [
              `${zone.wilayaCode}|${zone.methodCode}`,
              { fee: zone.deliveryFee, isActive: zone.isActive },
            ]),
          ),
        );
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [current]);

  const activeMethods = useMemo(() => methods.filter((m) => m.isActive), [methods]);

  const filteredWilayas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = wilayas.filter((w) => w.isActive);
    if (!q) return list;
    return list.filter(
      (w) =>
        w.nameFr.toLowerCase().includes(q) ||
        w.nameAr.includes(q) ||
        String(w.code).includes(q),
    );
  }, [wilayas, search]);

  /* ----- up-rate table cell ----- */

  const saveCell = async (wilaya: Wilaya, method: ShippingMethod, fee: number) => {
    if (!current) return;
    const key = `${wilaya.code}|${method.code}`;
    setFeeKeys((prev) => new Set(prev).add(key));
    const existing = zones[key];
    try {
      await upsertDeliveryZone({
        tenantId: current.id,
        wilayaCode: wilaya.code,
        methodCode: method.code,
        deliveryFee: fee,
        // Cell writes manage the fee and the active flag only — any other
        // stored values must survive.
        freeOverThreshold: null,
        minimumOrder: null,
        isActive: existing ? existing.isActive : true,
      });
      setZones((prev) => ({
        ...prev,
        [key]: { fee, isActive: existing ? existing.isActive : true },
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
      load();
    } finally {
      setFeeKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleCellActive = async (wilaya: Wilaya, method: ShippingMethod) => {
    if (!current) return;
    const key = `${wilaya.code}|${method.code}`;
    const existing = zones[key];
    try {
      await upsertDeliveryZone({
        tenantId: current.id,
        wilayaCode: wilaya.code,
        methodCode: method.code,
        deliveryFee: existing?.fee ?? method.basePrice,
        freeOverThreshold: null,
        minimumOrder: null,
        isActive: !(existing?.isActive ?? true),
      });
      setZones((prev) => ({
        ...prev,
        [key]: { fee: existing?.fee ?? method.basePrice, isActive: !(existing?.isActive ?? true) },
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  /* ----- methods CRUD ----- */

  const saveEditor = async () => {
    if (!editor || !current) return;
    try {
      const basePrice = numOrError(editor.basePrice, t("number_invalid")) ?? 0;
      const freeOverThreshold = numOrError(
        editor.freeOverThreshold,
        t("number_invalid"),
      );
      const daysMin = numOrError(editor.estimatedDaysMin, t("number_invalid"));
      const daysMax = numOrError(editor.estimatedDaysMax, t("number_invalid"));

      const payload = {
        nameFr: editor.nameFr,
        nameAr: editor.nameAr || null,
        nameEn: editor.nameEn || null,
        descriptionFr: null,
        type: editor.type,
        provider: editor.provider || null,
        basePrice,
        freeOverThreshold,
        estimatedDaysMin: daysMin,
        estimatedDaysMax: daysMax,
        isActive: editor.isActive,
      };

      if (editor.id) {
        const patch = editor.code.trim()
          ? { ...payload, code: editor.code }
          : { ...payload };
        await updateShippingMethod(editor.id, patch);
      } else {
        const code =
          editor.code.trim() ||
          editor.nameFr
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") ||
          `method-${Date.now().toString(36)}`;
        await createShippingMethod({
          tenantId: current.id,
          code,
          ...payload,
          sortOrder: methods.length,
        });
      }
      setEditor(null);
      toast(t("saved"));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteShippingMethod(deleting.id);
      setDeleting(null);
      toast(t("product_deleted"));
      load();
    } catch (e) {
      setDeleting(null);
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  const move = async (method: ShippingMethod, dir: -1 | 1) => {
    if (!current) return;
    const index = methods.findIndex((m) => m.id === method.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= methods.length) return;
    const next = methods.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setMethods(next);
    try {
      await reorderShippingMethods(
        current.id,
        next.map((m) => m.id),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t("error_title"), "error");
      load();
    }
  };

  const confirmBulk = async () => {
    if (!bulk || !current) return;
    try {
      await applyDeliveryFeeToAllWilayas({
        tenantId: current.id,
        methodCode: bulk.method.code,
        deliveryFee: bulk.fee,
      });
      setBulk(null);
      toast(t("apply_fee_all_done"));
      load();
    } catch (e) {
      setBulk(null);
      toast(e instanceof Error ? e.message : t("error_title"), "error");
    }
  };

  /* ----- render ----- */

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={t("shipping_page")} subtitle={`${activeMethods.length} · ${t("shipping_methods")}`} />

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : failed ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <ErrorState title={t("error_title")} onRetry={load} retryLabel={t("retry")} />
        </div>
      ) : (
        <>
          {/* a. Delivery methods */}
          <Card>
            <CardHeader
              title={t("shipping_methods")}
              subtitle={t("shipping_methods_hint")}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setEditor(emptyDraft())}
                >
                  {t("add")}
                </Button>
              }
            />
            {methods.length === 0 ? (
              <EmptyState
                title={t("empty_methods")}
                hint={t("empty_methods_hint")}
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setEditor(emptyDraft())}
                  >
                    {t("add")}
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {methods.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex flex-col">
                      <button
                        onClick={() => move(m, -1)}
                        disabled={i === 0}
                        aria-label={t("move_up")}
                        className="cursor-pointer rounded p-0.5 text-text-muted hover:bg-bg-surface hover:text-text-primary disabled:cursor-default disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => move(m, 1)}
                        disabled={i === methods.length - 1}
                        aria-label={t("move_down")}
                        className="cursor-pointer rounded p-0.5 text-text-muted hover:bg-bg-surface hover:text-text-primary disabled:cursor-default disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Pin className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate text-[13px] font-medium text-text-primary">
                      {m.nameFr}
                      {m.nameAr && <span className="ms-1.5 text-text-muted">{m.nameAr}</span>}
                    </span>
                    <span className="tnum text-xs text-text-muted">{m.code}</span>
                    <Badge tone={TYPE_TONE[m.type]} dot>
                      {t(`shipping_type_${m.type}`)}
                    </Badge>
                    {m.provider && (
                      <span className="hidden truncate text-xs text-text-muted md:inline">
                        {m.provider}
                      </span>
                    )}
                    <span className="tnum ms-auto text-[13px] font-medium text-text-primary">
                      {m.basePrice} DA
                    </span>
                    <Switch
                      checked={m.isActive}
                      onChange={async (v) => {
                        try {
                          await updateShippingMethod(m.id, { isActive: v });
                          load();
                        } catch (e) {
                          toast(e instanceof Error ? e.message : t("error_title"), "error");
                        }
                      }}
                      label={t("is_active")}
                    />
                    <button
                      onClick={() => setEditor(draftFromMethod(m))}
                      aria-label={t("edit")}
                      className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-bg-surface hover:text-text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(m)}
                      aria-label={t("delete")}
                      className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-danger-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* b. Per-wilaya rates */}
          <Card>
            <CardHeader
              title={t("shipping_rates")}
              subtitle={t("shipping_rates_hint")}
              action={
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search_wilaya")}
                  aria-label={t("search_wilaya")}
                  className="h-9 w-44"
                />
              }
            />
            {activeMethods.length === 0 ? (
              <EmptyState title={t("empty_methods")} hint={t("empty_methods_hint")} />
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead className="sticky top-0 z-10 bg-bg-secondary">
                    <tr>
                      <th className="sticky start-0 z-20 border-b border-border bg-bg-secondary px-3 py-2 text-start text-xs font-medium text-text-secondary">
                        {t("wilaya")}
                      </th>
                      {activeMethods.map((m) => (
                        <th
                          key={m.id}
                          className="min-w-36 border-b border-border px-3 py-2 text-start"
                        >
                          <div className="font-medium text-text-primary">{m.nameFr}</div>
                          <div className="text-[11px] text-text-muted">
                            {t("price")} · {t("is_active")}
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="sticky start-0 z-20 bg-bg-secondary" />
                      {activeMethods.map((m) => (
                        <BulkHeader
                          key={m.id}
                          method={m}
                          t={t}
                          onBulk={setBulk}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWilayas.map((w) => (
                      <tr key={w.code} className="hover:bg-bg-surface/40">
                        <td className="sticky start-0 z-10 border-b border-border bg-bg-secondary px-3 py-1.5">
                          <span className="tnum text-text-muted">{String(w.code).padStart(2, "0")}</span>{" "}
                          <span className="text-text-primary">{w.nameFr}</span>
                          <span className="ms-1.5 text-text-muted">{w.nameAr}</span>
                        </td>
                        {activeMethods.map((m) => {
                          const key = `${w.code}|${m.code}`;
                          const cell = zones[key];
                          const saving = feeKeys.has(key);
                          return (
                            <td
                              key={m.id}
                              className={cn(
                                "border-b border-border px-3 py-1.5 transition-opacity",
                                saving && "opacity-50",
                              )}
                            >
                              <input
                                type="number"
                                min={0}
                                step={10}
                                aria-label={`${m.nameFr} — ${w.nameFr}`}
                                defaultValue={cell?.fee ?? ""}
                                disabled={saving}
                                onBlur={(e) => {
                                  const value = e.target.value.trim();
                                  if (value === "") return;
                                  const fee = Number(value);
                                  if (cell?.fee === fee || !Number.isFinite(fee) || fee < 0) return;
                                  saveCell(w, m, fee);
                                }}
                                className="me-1.5 h-7 w-20 rounded-[var(--radius-sm)] border border-border bg-bg-secondary px-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
                              />
                              <Switch
                                checked={cell ? cell.isActive : true}
                                onChange={() => toggleCellActive(w, m)}
                                label={`${m.nameFr} — ${w.nameFr}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredWilayas.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-text-muted">
                    {t("no_results")}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {/* method editor */}
      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? t("edit") : t("shipping_add_method_title")}
      >
        {editor && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("name")}>
                <Input
                  value={editor.nameFr}
                  onChange={(e) => setEditor({ ...editor, nameFr: e.target.value })}
                  autoFocus
                />
              </Field>
              <Field label={t("name_translations")} hint={t("name_hint")}>
                <div className="flex gap-1.5">
                  <Input
                    dir="rtl"
                    placeholder="العربية"
                    aria-label={t("name_translations")}
                    value={editor.nameAr}
                    onChange={(e) => setEditor({ ...editor, nameAr: e.target.value })}
                  />
                  <Input
                    placeholder="English"
                    value={editor.nameEn}
                    onChange={(e) => setEditor({ ...editor, nameEn: e.target.value })}
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("code")} hint={t("shipping_add_method")}>
                <Input
                  value={editor.code}
                  onChange={(e) => setEditor({ ...editor, code: e.target.value })}
                  disabled={editor.id !== undefined}
                />
              </Field>
              <Field label={t("type")}>
                <Select
                  value={editor.type}
                  onChange={(e) =>
                    setEditor({ ...editor, type: e.target.value as ShippingMethodType })
                  }
                >
                  <option value="home">{t("shipping_type_home")}</option>
                  <option value="desk">{t("shipping_type_desk")}</option>
                  <option value="pickup">{t("shipping_type_pickup")}</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("provider")}>
                <Input
                  value={editor.provider}
                  onChange={(e) => setEditor({ ...editor, provider: e.target.value })}
                />
              </Field>
              <Field label={t("price")}>
                <Input
                  type="number"
                  min={0}
                  value={editor.basePrice}
                  onChange={(e) => setEditor({ ...editor, basePrice: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("free_over_threshold")}>
                <Input
                  type="number"
                  min={0}
                  value={editor.freeOverThreshold}
                  onChange={(e) =>
                    setEditor({ ...editor, freeOverThreshold: e.target.value })
                  }
                />
              </Field>
              <Field label={t("estimated_days_min")}>
                <Input
                  type="number"
                  min={0}
                  value={editor.estimatedDaysMin}
                  onChange={(e) =>
                    setEditor({ ...editor, estimatedDaysMin: e.target.value })
                  }
                />
              </Field>
              <Field label={t("estimated_days_max")}>
                <Input
                  type="number"
                  min={0}
                  value={editor.estimatedDaysMax}
                  onChange={(e) =>
                    setEditor({ ...editor, estimatedDaysMax: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="flex items-center justify-between">
              <Switch
                checked={editor.isActive}
                onChange={(v) => setEditor({ ...editor, isActive: v })}
                label={t("is_active")}
              />
              <span className="text-xs text-text-muted">{t("is_active")}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditor(null)}>{t("cancel")}</Button>
              <Button variant="primary" disabled={editor.nameFr.trim().length < 2} onClick={saveEditor}>
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* bulk apply this fee to all wilayas */}
      <ConfirmDialog
        open={bulk !== null}
        onClose={() => setBulk(null)}
        onConfirm={confirmBulk}
        title={bulk?.method.nameFr ?? ""}
        body={t("apply_fee_all_body")}
        confirmLabel={t("apply_fee_all")}
        cancelLabel={t("cancel")}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("confirm_delete_title")}
        body={t("confirm_delete_body")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}

/** Per-column bulk control: type a fee, apply it to all 58 wilayas. */
function BulkHeader({
  method,
  t,
  onBulk,
}: {
  method: ShippingMethod;
  t: (key: string) => string;
  onBulk: (next: { method: ShippingMethod; fee: number } | null) => void;
}) {
  const [fee, setFee] = useState("");
  return (
    <th key={method.id} className="border-b border-border px-3 pb-2">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          step={10}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          aria-label={`${t("apply_fee_all")} — ${method.nameFr}`}
          className="h-7 w-20 px-2 text-xs"
        />
        <Button
          size="sm"
          disabled={!Number.isFinite(Number(fee)) || fee === ""}
          onClick={() => {
            onBulk({ method, fee: Number(fee) });
            setFee("");
          }}
        >
          {t("apply_fee_all")}
        </Button>
      </div>
    </th>
  );
}
