import { Prisma } from "@prisma/client";

export const ORDER_PAYMENT_STATUS = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderPaymentStatus = typeof ORDER_PAYMENT_STATUS[keyof typeof ORDER_PAYMENT_STATUS];

export const ORDER_FULFILLMENT_TYPE = {
  PICKUP: "PICKUP",
  DELIVERY: "DELIVERY",
  OTHER: "OTHER",
} as const;

export type OrderFulfillmentType = typeof ORDER_FULFILLMENT_TYPE[keyof typeof ORDER_FULFILLMENT_TYPE];

export const SUPPORTED_CURRENCIES = ["ARS"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export function isOrderPaymentStatus(value: unknown): value is OrderPaymentStatus {
  return typeof value === "string" && Object.values(ORDER_PAYMENT_STATUS).includes(value as OrderPaymentStatus);
}
export function isOrderFulfillmentType(value: unknown): value is OrderFulfillmentType {
  return typeof value === "string" && Object.values(ORDER_FULFILLMENT_TYPE).includes(value as OrderFulfillmentType);
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
}

export const ORDER_PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
};

export const ORDER_FULFILLMENT_LABELS: Record<OrderFulfillmentType, string> = {
  PICKUP: "Retiro",
  DELIVERY: "Entrega",
  OTHER: "Otro",
};

export function decimalString(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

export function formatOrderMoney(value: Prisma.Decimal | string | number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}
