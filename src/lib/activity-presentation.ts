import type { Prisma } from "@prisma/client";

import { ACTIVITY_ACTION } from "@/lib/activity-types";
import { ROLE_LABELS } from "@/lib/team-labels";

function objectMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function text(metadata: Prisma.JsonObject, key: string) {
  return typeof metadata[key] === "string" ? metadata[key] as string : null;
}

function count(metadata: Prisma.JsonObject) {
  return typeof metadata.count === "number" ? metadata.count : 0;
}

export function describeActivity(action: string, rawMetadata: Prisma.JsonValue | null) {
  const metadata = objectMetadata(rawMetadata);
  const name = text(metadata, "name") ?? "sin nombre";
  const target = text(metadata, "target") ?? "el miembro";
  switch (action) {
    case ACTIVITY_ACTION.CONTACT_CREATED: return `creó el contacto ${name}`;
    case ACTIVITY_ACTION.CONTACT_UPDATED: return `actualizó el contacto ${name}`;
    case ACTIVITY_ACTION.CONTACT_DELETED: return `eliminó el contacto ${name}`;
    case ACTIVITY_ACTION.CONTACT_AUTHORIZATION_CHANGED: return `${metadata.authorized ? "autorizó" : "quitó la autorización de"} ${name} para campañas`;
    case ACTIVITY_ACTION.CONTACT_AUTHORIZATION_BULK_CHANGED: return `${metadata.authorized ? "autorizó" : "quitó la autorización de"} ${count(metadata)} contactos para campañas`;
    case ACTIVITY_ACTION.CONTACTS_IMPORTED: return `importó ${count(metadata)} contactos`;
    case ACTIVITY_ACTION.GROUP_CREATED: return `creó el grupo ${name}`;
    case ACTIVITY_ACTION.GROUP_UPDATED: return `actualizó el grupo ${name}`;
    case ACTIVITY_ACTION.GROUP_DELETED: return `eliminó el grupo ${name}`;
    case ACTIVITY_ACTION.GROUP_MEMBERS_ADDED: return `agregó ${count(metadata)} contactos al grupo ${name}`;
    case ACTIVITY_ACTION.GROUP_MEMBERS_REMOVED: return `quitó ${count(metadata)} contactos del grupo ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_CREATED: return `creó la campaña ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_UPDATED: return `actualizó la campaña ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_READY: return `marcó como lista la campaña ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_SEND_STARTED: return `inició la simulación de ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_COMPLETED: return `completó la simulación de ${name} para ${count(metadata)} destinatarios`;
    case ACTIVITY_ACTION.CAMPAIGN_PARTIAL: return `completó parcialmente la simulación de ${name}`;
    case ACTIVITY_ACTION.CAMPAIGN_FAILED: return `falló la simulación de ${name}`;
    case ACTIVITY_ACTION.WORKSPACE_UPDATED: return "actualizó la configuración de la cartera";
    case ACTIVITY_ACTION.MEMBER_ROLE_CHANGED: return `cambió el rol de ${target} de ${ROLE_LABELS[text(metadata, "from") as keyof typeof ROLE_LABELS] ?? text(metadata, "from")} a ${ROLE_LABELS[text(metadata, "to") as keyof typeof ROLE_LABELS] ?? text(metadata, "to")}`;
    case ACTIVITY_ACTION.MEMBER_PERMISSION_CHANGED: return `cambió un permiso de ${target}`;
    case ACTIVITY_ACTION.MEMBER_PERMISSIONS_RESET: return `restableció los permisos de ${target}`;
    case ACTIVITY_ACTION.MEMBER_SCOPE_CHANGED: return `cambió el alcance de grupos de ${target}`;
    case ACTIVITY_ACTION.INVITATION_CREATED: return `creó una invitación para ${text(metadata, "email") ?? "un miembro"}`;
    case ACTIVITY_ACTION.INVITATION_RESENT: return `reenvió la invitación para ${text(metadata, "email") ?? "un miembro"}`;
    case ACTIVITY_ACTION.INVITATION_REVOKED: return `revocó la invitación para ${text(metadata, "email") ?? "un miembro"}`;
    case ACTIVITY_ACTION.INVITATION_ACCEPTED: return `aceptó la invitación para ${text(metadata, "email") ?? "un miembro"}`;
    case ACTIVITY_ACTION.CASE_CREATED: return `creó el caso #${metadata.number ?? "-"}: ${text(metadata, "title") ?? "sin título"}`;
    case ACTIVITY_ACTION.CASE_UPDATED: return `actualizó el caso #${metadata.number ?? "-"}`;
    case ACTIVITY_ACTION.CASE_STATUS_CHANGED: return `cambió el estado del caso #${metadata.number ?? "-"}`;
    case ACTIVITY_ACTION.CASE_CLOSED: return `cerró el caso #${metadata.number ?? "-"}`;
    case ACTIVITY_ACTION.CASE_REOPENED: return `reabrió el caso #${metadata.number ?? "-"}`;
    default: return "realizó una acción en la cartera";
  }
}

export function activityEntityLabel(entityType: string) {
  return ({ CONTACT: "Contacto", GROUP: "Grupo", CAMPAIGN: "Campaña", WORKSPACE: "Configuración", MEMBER: "Equipo", INVITATION: "Invitación", CASE: "Caso" } as Record<string, string>)[entityType] ?? "Actividad";
}
