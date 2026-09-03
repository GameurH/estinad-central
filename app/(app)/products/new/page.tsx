"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTenant } from "@/components/providers/tenant-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { EMPTY_DRAFT, ProductForm } from "@/components/products/product-form";
import { getCategories } from "@/lib/services";
import type { Category } from "@/lib/domain";

export default function NewProductPage() {
  const router = useRouter();
  const { current } = useTenant();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!current) return;
    getCategories(current.id)
      .then(setCategories)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [current]);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={t("new_product")}
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
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : failed ? (
        <Card>
          <ErrorState
            title={t("error_title")}
            onRetry={() => window.location.reload()}
            retryLabel={t("retry")}
          />
        </Card>
      ) : current ? (
        <ProductForm
          initial={{ ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? null }}
          categories={categories}
          variants={[]}
          tenantId={current.id}
          mode="create"
        />
      ) : null}
    </div>
  );
}
