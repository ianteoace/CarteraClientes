import { ORDER_STATUS, type OrderStatus } from "@/lib/case-types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUS.DRAFT]: "Borrador",
  [ORDER_STATUS.CONFIRMED]: "Confirmado",
  [ORDER_STATUS.PREPARING]: "Preparando",
  [ORDER_STATUS.READY]: "Listo",
  [ORDER_STATUS.COMPLETED]: "Completado",
  [ORDER_STATUS.CANCELLED]: "Cancelado",
};
