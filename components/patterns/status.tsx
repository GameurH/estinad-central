import { Badge } from "@/components/ui/badge";
import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  ShippingStatus,
  TenantStatus,
} from "@/lib/domain";

const orderStatusTone: Record<
  OrderStatus,
  "success" | "warning" | "danger" | "info" | "neutral" | "accent"
> = {
  draft: "neutral",
  confirmed: "info",
  preparing: "warning",
  ready: "accent",
  completed: "success",
  void: "danger",
};

const ORDER_STATUS_FR: Record<OrderStatus, string> = {
  draft: "Brouillon",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  completed: "Terminée",
  void: "Annulée",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={orderStatusTone[status]} dot>
      {ORDER_STATUS_FR[status]}
    </Badge>
  );
}

const ORDER_TYPE_FR: Record<OrderType, string> = {
  dine_in: "Sur place",
  takeaway: "À emporter",
  delivery: "Livraison",
};

export function OrderTypeBadge({ type }: { type: OrderType }) {
  return <Badge>{ORDER_TYPE_FR[type]}</Badge>;
}

const SHIPPING_FR: Record<ShippingStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const shippingTone: Record<ShippingStatus, "success" | "warning" | "danger" | "info" | "neutral" | "accent"> = {
  pending: "warning",
  confirmed: "info",
  preparing: "warning",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
};

export function ShippingStatusBadge({ status }: { status: ShippingStatus }) {
  return (
    <Badge tone={shippingTone[status]} dot>
      {SHIPPING_FR[status]}
    </Badge>
  );
}

const PAYMENT_STATUS_FR: Record<PaymentStatus, string> = {
  pending: "En attente",
  paid: "Payée",
  failed: "Échouée",
  refunded: "Remboursée",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone =
    status === "paid" ? "success" : status === "pending" ? "warning" : "danger";
  return (
    <Badge tone={tone} dot>
      {PAYMENT_STATUS_FR[status]}
    </Badge>
  );
}

const PAYMENT_METHOD_FR: Record<PaymentMethod, string> = {
  cash: "Espèces",
  cib_card: "CIB",
  edahabia: "EDAHABIA",
  check: "Chèque",
  qr: "QR",
};

export function PaymentMethodLabel({ method }: { method: PaymentMethod }) {
  return <span className="text-text-secondary">{PAYMENT_METHOD_FR[method]}</span>;
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_FR[method];
}

const TENANT_STATUS_FR: Record<TenantStatus, string> = {
  trial: "Essai",
  active: "Actif",
  suspended: "Suspendu",
  cancelled: "Résilié",
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const tone =
    status === "active"
      ? "success"
      : status === "trial"
        ? "info"
        : status === "suspended"
          ? "warning"
          : "danger";
  return <Badge tone={tone}>{TENANT_STATUS_FR[status]}</Badge>;
}

export function AvailabilityBadge({ available }: { available: boolean }) {
  return available ? (
    <Badge tone="success" dot>
      Disponible
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Indisponible
    </Badge>
  );
}
