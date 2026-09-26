import { WorkspacePermission } from "@prisma/client";

export const WORKSPACE_MODULE = {
  CAMPAIGNS: "CAMPAIGNS",
  TICKETS: "TICKETS",
  INCIDENTS: "INCIDENTS",
  ORDERS: "ORDERS",
} as const;

export type WorkspaceModuleKey = typeof WORKSPACE_MODULE[keyof typeof WORKSPACE_MODULE];

export const KNOWN_MODULES = Object.values(WORKSPACE_MODULE) as readonly WorkspaceModuleKey[];
export const AVAILABLE_MODULES = [
  WORKSPACE_MODULE.CAMPAIGNS,
  WORKSPACE_MODULE.TICKETS,
  WORKSPACE_MODULE.INCIDENTS,
  WORKSPACE_MODULE.ORDERS,
] as const;

export const NEW_WORKSPACE_MODULE_DEFAULTS: Readonly<Record<WorkspaceModuleKey, boolean>> = {
  CAMPAIGNS: true,
  TICKETS: false,
  INCIDENTS: false,
  ORDERS: false,
};

export const WORKSPACE_MODULE_DETAILS: Readonly<Record<WorkspaceModuleKey, { label: string; description: string }>> = {
  CAMPAIGNS: { label: "Campañas", description: "Mensajes masivos y programados." },
  TICKETS: { label: "Tickets", description: "Gestión de solicitudes y problemas de contactos." },
  INCIDENTS: { label: "Incidencias", description: "Problemas generales relacionados con varios tickets." },
  ORDERS: { label: "Pedidos", description: "Registrá ventas, items, pagos y entregas asociadas a tus contactos." },
};

export function isKnownWorkspaceModule(value: string): value is WorkspaceModuleKey {
  return KNOWN_MODULES.includes(value as WorkspaceModuleKey);
}

export function isAvailableWorkspaceModule(value: string): value is typeof AVAILABLE_MODULES[number] {
  return AVAILABLE_MODULES.includes(value as typeof AVAILABLE_MODULES[number]);
}

export const MODULE_PERMISSIONS: Readonly<Partial<Record<WorkspaceModuleKey, readonly WorkspacePermission[]>>> = {
  CAMPAIGNS: [WorkspacePermission.CAMPAIGN_VIEW, WorkspacePermission.CAMPAIGN_CREATE, WorkspacePermission.CAMPAIGN_EDIT, WorkspacePermission.CAMPAIGN_SEND, WorkspacePermission.CAMPAIGN_DELETE],
  TICKETS: [WorkspacePermission.TICKET_VIEW, WorkspacePermission.TICKET_CREATE, WorkspacePermission.TICKET_EDIT, WorkspacePermission.TICKET_ASSIGN, WorkspacePermission.TICKET_RESOLVE],
  INCIDENTS: [WorkspacePermission.INCIDENT_VIEW, WorkspacePermission.INCIDENT_CREATE, WorkspacePermission.INCIDENT_EDIT, WorkspacePermission.INCIDENT_ASSIGN, WorkspacePermission.INCIDENT_RESOLVE],
  ORDERS: [WorkspacePermission.ORDER_VIEW, WorkspacePermission.ORDER_CREATE, WorkspacePermission.ORDER_EDIT, WorkspacePermission.ORDER_MANAGE_STATUS, WorkspacePermission.ORDER_MANAGE_PAYMENT],
};

export function getPermissionModule(permission: WorkspacePermission): WorkspaceModuleKey | null {
  for (const [key, permissions] of Object.entries(MODULE_PERMISSIONS)) {
    if (permissions?.includes(permission)) return key as WorkspaceModuleKey;
  }
  return null;
}
