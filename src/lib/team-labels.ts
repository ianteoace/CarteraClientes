import { WorkspacePermission, WorkspaceRole } from "@prisma/client";

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  AGENT: "Agente",
  VIEWER: "Solo lectura",
};

export const PERMISSION_GROUPS = [
  {
    title: "Contactos",
    permissions: [
      [WorkspacePermission.CONTACT_VIEW, "Ver"],
      [WorkspacePermission.CONTACT_CREATE, "Crear"],
      [WorkspacePermission.CONTACT_EDIT, "Editar"],
      [WorkspacePermission.CONTACT_DELETE, "Eliminar"],
    ],
  },
  {
    title: "Grupos",
    permissions: [
      [WorkspacePermission.GROUP_VIEW, "Ver"],
      [WorkspacePermission.GROUP_CREATE, "Crear"],
      [WorkspacePermission.GROUP_EDIT, "Editar"],
      [WorkspacePermission.GROUP_DELETE, "Eliminar"],
      [WorkspacePermission.GROUP_MANAGE_MEMBERS, "Gestionar miembros"],
    ],
  },
  {
    title: "Campañas",
    permissions: [
      [WorkspacePermission.CAMPAIGN_VIEW, "Ver"],
      [WorkspacePermission.CAMPAIGN_CREATE, "Crear"],
      [WorkspacePermission.CAMPAIGN_EDIT, "Editar"],
      [WorkspacePermission.CAMPAIGN_SEND, "Enviar"],
      [WorkspacePermission.CAMPAIGN_DELETE, "Eliminar"],
    ],
  },
  {
    title: "Configuración",
    permissions: [
      [WorkspacePermission.WORKSPACE_SETTINGS_VIEW, "Ver"],
      [WorkspacePermission.WORKSPACE_SETTINGS_EDIT, "Editar"],
    ],
  },
  {
    title: "Tickets",
    permissions: [
      [WorkspacePermission.TICKET_VIEW, "Ver"],
      [WorkspacePermission.TICKET_CREATE, "Crear"],
      [WorkspacePermission.TICKET_EDIT, "Editar"],
      [WorkspacePermission.TICKET_ASSIGN, "Asignar y gestionar participantes"],
      [WorkspacePermission.TICKET_RESOLVE, "Cambiar estado y resolución"],
    ],
  },
  {
    title: "Pedidos",
    permissions: [
      [WorkspacePermission.ORDER_VIEW, "Ver"],
      [WorkspacePermission.ORDER_CREATE, "Crear"],
      [WorkspacePermission.ORDER_EDIT, "Editar"],
      [WorkspacePermission.ORDER_MANAGE_STATUS, "Cambiar estado"],
      [WorkspacePermission.ORDER_MANAGE_PAYMENT, "Gestionar pago"],
    ],
  },
  {
    title: "Incidencias",
    permissions: [
      [WorkspacePermission.INCIDENT_VIEW, "Ver"],
      [WorkspacePermission.INCIDENT_CREATE, "Crear"],
      [WorkspacePermission.INCIDENT_EDIT, "Editar"],
      [WorkspacePermission.INCIDENT_ASSIGN, "Asignar y gestionar participantes"],
      [WorkspacePermission.INCIDENT_RESOLVE, "Cambiar estado y resolución"],
    ],
  },
  {
    title: "Equipo",
    permissions: [
      [WorkspacePermission.TEAM_VIEW, "Ver"],
      [WorkspacePermission.TEAM_METRICS_VIEW, "Ver métricas del equipo"],
      [WorkspacePermission.TEAM_MANAGE, "Gestionar equipo"],
      [WorkspacePermission.PERMISSIONS_MANAGE, "Gestionar permisos"],
    ],
  },
] as const;
