"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/components/providers/toast-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";
import {
  getCategories,
  getCategoryName,
  missingTranslationLangs,
} from "@/lib/services";
import type { Category, CategoryType } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface Node extends Category {
  children: Node[];
}

function buildTree(categories: Category[]): Node[] {
  const map = new Map<string, Node>();
  for (const c of categories) map.set(c.id, { ...c, children: [] });
  const roots: Node[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const TYPE_TONE: Record<CategoryType, "info" | "success" | "neutral"> = {
  hospitality: "success",
  retail: "info",
  service: "neutral",
};

export default function CategoriesPage() {
  const { current } = useTenant();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<null | {
    id?: string;
    name: string;
    type: CategoryType;
    parentId: string | null;
  }>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  useEffect(() => {
    if (!current) return;
    getCategories(current.id)
      .then(setCategories)
      .finally(() => setLoading(false));
  }, [current]);

  const tree = useMemo(() => buildTree(categories), [categories]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveEditor = () => {
    if (!editor || editor.name.trim().length < 2) return;
    if (editor.id) {
      setCategories((list) =>
        list.map((c) =>
          c.id === editor.id
            ? { ...c, name: editor.name.trim(), type: editor.type, parentId: editor.parentId }
            : c,
        ),
      );
    } else {
      setCategories((list) => [
        ...list,
        {
          id: `c-local-${Date.now()}`,
          tenantId: current?.id ?? "",
          name: editor.name.trim(),
          type: editor.type,
          parentId: editor.parentId,
          productCount: 0,
        },
      ]);
    }
    setEditor(null);
    toast(t("saved"));
  };

  const confirmDelete = () => {
    if (!deleting) return;
    if (deleting.productCount > 0) {
      toast(`${deleting.productCount} ${t("products_count")}`, "error");
      setDeleting(null);
      return;
    }
    setCategories((list) =>
      list
        .filter((c) => c.id !== deleting.id)
        .map((c) => (c.parentId === deleting.id ? { ...c, parentId: null } : c)),
    );
    setDeleting(null);
    toast(t("product_deleted"));
  };

  const renderNode = (node: Node, depth: number) => {
    const isCollapsed = collapsed.has(node.id);
    const hasChildren = node.children.length > 0;
    const missing = missingTranslationLangs("category", node.id);
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 px-3 py-2.5 transition-colors hover:bg-bg-surface/60"
          style={{ paddingInlineStart: `${12 + depth * 22}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggle(node.id)}
              aria-label={isCollapsed ? "Expand" : "Collapse"}
              aria-expanded={!isCollapsed}
              className="cursor-pointer rounded p-1 text-text-muted hover:bg-bg-surface hover:text-text-primary"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-6" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-text-primary">
              {getCategoryName(node, lang)}
              {missing.length > 0 && (
                <span className="ms-1.5 rounded bg-warning-muted px-1 py-px text-[10px] font-medium text-warning">
                  FR+
                </span>
              )}
            </span>
            <span className="tnum block text-xs text-text-muted">
              {node.productCount} {t("products_count")}
            </span>
          </span>
          <Badge tone={TYPE_TONE[node.type]}>{node.type}</Badge>
          <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() =>
                setEditor({
                  id: node.id,
                  name: node.name,
                  type: node.type,
                  parentId: node.parentId,
                })
              }
              aria-label={`${t("details")} ${node.name}`}
              className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-bg-surface hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeleting(node)}
              aria-label={`${t("delete")} ${node.name}`}
              className="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-text-muted hover:bg-danger-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        {!isCollapsed &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const parentOptions = categories.filter((c) => c.id !== editor?.id);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("categories")}
        subtitle={`${categories.length} · ${categories.reduce((s, c) => s + c.productCount, 0)} ${t("products_count")}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setEditor({ name: "", type: "hospitality", parentId: null })
            }
          >
            {t("add")}
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : categories.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg-secondary">
          <EmptyState
            title={t("empty_categories")}
            hint={t("empty_categories_hint")}
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setEditor({ name: "", type: "hospitality", parentId: null })}
              >
                {t("add")}
              </Button>
            }
          />
        </div>
      ) : (
        <div
          className={cn(
            "divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg-secondary",
          )}
        >
          {tree.map((n) => renderNode(n, 0))}
        </div>
      )}

      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? t("details") : t("add")}
      >
        {editor && (
          <div className="space-y-4">
            <Field label={t("name")}>
              <Input
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("type")}>
                <Select
                  value={editor.type}
                  onChange={(e) => setEditor({ ...editor, type: e.target.value as CategoryType })}
                >
                  <option value="hospitality">hospitality</option>
                  <option value="retail">retail</option>
                  <option value="service">service</option>
                </Select>
              </Field>
              <Field label={t("parent_category")}>
                <Select
                  value={editor.parentId ?? ""}
                  onChange={(e) =>
                    setEditor({ ...editor, parentId: e.target.value || null })
                  }
                >
                  <option value="">{t("top_level")}</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditor(null)}>{t("cancel")}</Button>
              <Button
                variant="primary"
                disabled={editor.name.trim().length < 2}
                onClick={saveEditor}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("confirm_delete_title")}
        body={
          deleting && deleting.productCount > 0
            ? `${deleting.productCount} ${t("products_count")}`
            : t("confirm_delete_body")
        }
        confirmLabel={t("delete")}
      />
    </div>
  );
}
