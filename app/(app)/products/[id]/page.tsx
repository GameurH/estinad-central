"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { draftFromProduct, ProductForm } from "@/components/products/product-form";
import { getCategories, getProduct } from "@/lib/services";
import type { Category, Product, Variant } from "@/lib/domain";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { current } = useTenant();
  const { t } = useLanguage();
  const [product, setProduct] = useState<(Product & { variants: Variant[] }) | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "missing" | "ready">("loading");

  useEffect(() => {
    if (!current) return;
    Promise.all([getProduct(current.id, id), getCategories(current.id)])
      .then(([p, c]) => {
        if (!p) {
          setStatus("missing");
          return;
        }
        setProduct(p);
        setCategories(c);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [current, id]);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={product?.name ?? t("edit_product")}
        subtitle={product?.sku ?? undefined}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="h-4 w-4 rtl:rotate-180" />}
            onClick={() => router.push("/products")}
          >
            {t("back")}
          </Button>
        }
      />
      {status === "loading" && <Skeleton className="h-96 w-full" />}
      {status === "error" && (
        <Card>
          <ErrorState
            title={t("error_title")}
            onRetry={() => window.location.reload()}
            retryLabel={t("retry")}
          />
        </Card>
      )}
      {status === "missing" && (
        <Card>
          <EmptyState
            title={t("no_results")}
            hint={t("no_results_hint")}
            action={
              <Button size="sm" onClick={() => router.push("/products")}>
                {t("back")}
              </Button>
            }
          />
        </Card>
      )}
      {status === "ready" && product && current && (
        <ProductForm
          initial={draftFromProduct(product)}
          categories={categories}
          variants={product.variants}
          productId={product.id}
          tenantId={current.id}
          mode="edit"
        />
      )}
    </div>
  );
}
