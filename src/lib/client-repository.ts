import { Prisma, WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, hasAllGroups, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

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
      return transaction.client.create({ data: { ...data, workspaceId: context.workspaceId, ...(groupIds.length ? { clientGroups: { create: groupIds.map((groupId) => ({ groupId })) } } : {}) } });
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
    const result = await prisma.client.updateMany({ where: { id, ...getClientScopeFilter(context) }, data });
    if (result.count === 0) throw new ClientNotFoundError("El cliente no existe.");
  } catch (error) {
    if (isUniqueNormalizedPhoneError(error)) throw new DuplicatePhoneError("Ya existe un cliente con ese teléfono.");
    throw error;
  }
}

export async function deleteClient(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.CONTACT_DELETE);
  const result = await prisma.client.deleteMany({ where: { id, ...getClientScopeFilter(context) } });
  if (result.count === 0) throw new ClientNotFoundError("El cliente no existe.");
}

export async function updateClientAuthorization(context: AuthorizationContext, id: string, optIn: boolean) {
  requirePermission(context, WorkspacePermission.CONTACT_EDIT);
  const result = await prisma.client.updateMany({ where: { id, ...getClientScopeFilter(context) }, data: { optIn } });
  if (!result.count) throw new ClientNotFoundError("El contacto no existe.");
}

export async function updateSelectedClientsAuthorization(context: AuthorizationContext, clientIds: string[], optIn: boolean) {
  requirePermission(context, WorkspacePermission.CONTACT_EDIT);
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) throw new ClientValidationError("Seleccioná al menos un contacto.");
  const ownedCount = await prisma.client.count({ where: { id: { in: ids }, ...getClientScopeFilter(context) } });
  if (ownedCount !== ids.length) throw new ClientValidationError("No tenés acceso a uno de los contactos seleccionados.");
  const result = await prisma.client.updateMany({ where: { id: { in: ids }, ...getClientScopeFilter(context) }, data: { optIn } });
  return result.count;
}
