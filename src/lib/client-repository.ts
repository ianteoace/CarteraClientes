import { Prisma, WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, hasAllGroups, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";

export type ClientInput = { name: string; phone: string; company: string; notes: string; optIn: boolean; groupIds?: string[] };
export type ClientListItem = { id: string; name: string; phone: string; phoneNormalized: string; company: string | null; notes: string | null; optIn: boolean };
export class ClientValidationError extends Error {}
export class DuplicatePhoneError extends Error {}
export class ClientNotFoundError extends Error {}

export function normalizeClientInput(input: ClientInput) {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const company = input.company.trim();
  const notes = input.notes.trim();
  if (!name) throw new ClientValidationError("El nombre es obligatorio.");
  if (!phone) throw new ClientValidationError("El teléfono es obligatorio.");
  if (notes.length > 5000) throw new ClientValidationError("Las notas no pueden superar los 5000 caracteres.");
  return { name, phone, phoneNormalized: normalizePhone(phone), company: company || null, notes: notes || null, optIn: input.optIn };
}

function normalizeGroupIds(groupIds: string[] | undefined) {
  return [...new Set((groupIds ?? []).map((groupId) => groupId.trim()).filter(Boolean))];
}

function isUniqueNormalizedPhoneError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes("workspaceId") && error.meta.target.includes("phoneNormalized");
}

export async function listClients(context: AuthorizationContext): Promise<ClientListItem[]> {
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  return prisma.client.findMany({ where: getClientScopeFilter(context), select: { id: true, name: true, phone: true, phoneNormalized: true, company: true, notes: true, optIn: true }, orderBy: { createdAt: "desc" } });
}

export async function getClientDetails(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  return prisma.client.findFirst({ where: { id, ...getClientScopeFilter(context) }, select: { id: true, name: true, phone: true, company: true, notes: true, optIn: true, createdAt: true, clientGroups: { where: hasPermission(context, WorkspacePermission.GROUP_VIEW) ? { group: getGroupScopeFilter(context) } : { groupId: { in: [] } }, select: { group: { select: { id: true, name: true } } }, orderBy: { group: { name: "asc" } } } } });
}

export async function createClient(context: AuthorizationContext, input: ClientInput) {
  requirePermission(context, WorkspacePermission.CONTACT_CREATE);
  const data = normalizeClientInput(input);
  const groupIds = normalizeGroupIds(input.groupIds);
  if (!hasAllGroups(context) && groupIds.length === 0) {
    throw new ClientValidationError("Seleccioná al menos un grupo al que tengas acceso.");
  }
  try {
    return await prisma.$transaction(async (transaction) => {
      if (groupIds.length > 0) {
        const count = await transaction.group.count({ where: { id: { in: groupIds }, ...getGroupScopeFilter(context) } });
        if (count !== groupIds.length) throw new ClientValidationError("No tenés acceso a uno de los grupos seleccionados.");
      }
      const client = await transaction.client.create({ data: { ...data, workspaceId: context.workspaceId, ...(groupIds.length ? { clientGroups: { create: groupIds.map((groupId) => ({ groupId })) } } : {}) } });
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, entityId: client.id, action: ACTIVITY_ACTION.CONTACT_CREATED, metadata: { name: client.name } }, transaction);
      return client;
    });
  } catch (error) {
    if (isUniqueNormalizedPhoneError(error)) throw new DuplicatePhoneError("Ya existe un cliente con ese teléfono.");
    throw error;
  }
}

export async function updateClient(context: AuthorizationContext, id: string, input: ClientInput) {
  requirePermission(context, WorkspacePermission.CONTACT_EDIT);
  const data = normalizeClientInput(input);
  try {
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.client.findFirst({ where: { id, ...getClientScopeFilter(context) }, select: { id: true, name: true, phone: true, phoneNormalized: true, company: true, notes: true, optIn: true } });
      if (!current) throw new ClientNotFoundError("El cliente no existe.");
      const changedFields = (Object.keys(data) as Array<keyof typeof data>).filter((field) => current[field] !== data[field]);
      if (!changedFields.length) return;
      const client = await transaction.client.update({ where: { id: current.id }, data });
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, entityId: client.id, action: ACTIVITY_ACTION.CONTACT_UPDATED, metadata: { name: client.name, changedFields } }, transaction);
      if (current.optIn !== client.optIn) {
        await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, entityId: client.id, action: ACTIVITY_ACTION.CONTACT_AUTHORIZATION_CHANGED, metadata: { name: client.name, authorized: client.optIn } }, transaction);
      }
    });
  } catch (error) {
    if (isUniqueNormalizedPhoneError(error)) throw new DuplicatePhoneError("Ya existe un cliente con ese teléfono.");
    throw error;
  }
}

export async function deleteClient(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.CONTACT_DELETE);
  await prisma.$transaction(async (transaction) => {
    const client = await transaction.client.findFirst({ where: { id, ...getClientScopeFilter(context) }, select: { id: true, name: true } });
    if (!client) throw new ClientNotFoundError("El cliente no existe.");
    await transaction.client.delete({ where: { id: client.id } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, entityId: client.id, action: ACTIVITY_ACTION.CONTACT_DELETED, metadata: { name: client.name } }, transaction);
  });
}

export async function updateClientAuthorization(context: AuthorizationContext, id: string, optIn: boolean) {
  requirePermission(context, WorkspacePermission.CONTACT_EDIT);
  await prisma.$transaction(async (transaction) => {
    const client = await transaction.client.findFirst({ where: { id, ...getClientScopeFilter(context) }, select: { id: true, name: true, optIn: true } });
    if (!client) throw new ClientNotFoundError("El contacto no existe.");
    if (client.optIn === optIn) return;
    await transaction.client.update({ where: { id: client.id }, data: { optIn } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, entityId: client.id, action: ACTIVITY_ACTION.CONTACT_AUTHORIZATION_CHANGED, metadata: { name: client.name, authorized: optIn } }, transaction);
  });
}

export async function updateSelectedClientsAuthorization(context: AuthorizationContext, clientIds: string[], optIn: boolean) {
  requirePermission(context, WorkspacePermission.CONTACT_EDIT);
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) throw new ClientValidationError("Seleccioná al menos un contacto.");
  return prisma.$transaction(async (transaction) => {
    const ownedCount = await transaction.client.count({ where: { id: { in: ids }, ...getClientScopeFilter(context) } });
    if (ownedCount !== ids.length) throw new ClientValidationError("No tenés acceso a uno de los contactos seleccionados.");
    const result = await transaction.client.updateMany({ where: { id: { in: ids }, ...getClientScopeFilter(context), optIn: { not: optIn } }, data: { optIn } });
    if (result.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONTACT, action: ACTIVITY_ACTION.CONTACT_AUTHORIZATION_BULK_CHANGED, metadata: { count: result.count, authorized: optIn } }, transaction);
    return result.count;
  });
}
