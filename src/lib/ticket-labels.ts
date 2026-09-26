import type { TicketStatus } from "@/lib/case-types";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En proceso",
  WAITING_CUSTOMER: "Esperando cliente",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const TICKET_PRIORITY_LABELS = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
} as const;
