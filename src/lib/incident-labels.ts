import type { IncidentStatus } from "@/lib/case-types";

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: "Abierta",
  INVESTIGATING: "Investigando",
  MONITORING: "Monitoreando",
  RESOLVED: "Resuelta",
  CLOSED: "Cerrada",
};

export const INCIDENT_PRIORITY_LABELS = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
} as const;
