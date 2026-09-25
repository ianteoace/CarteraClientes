import { WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, grantMemberGroupAccess, hasAllGroups, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export type GroupInput = {
  name: string;
  description: string;
};

export type GroupListItem = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
};

export type GroupMember = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  optIn: boolean;
};

export type GroupDetails = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  members: GroupMember[];
};

export class GroupValidationError extends Error {}

function normalizeGroupInput(input: GroupInput) {
  const name = input.name.trim();
  const description = input.description.trim();

  if (!name) {
    throw new GroupValidationError("El nombre del grupo es obligatorio.");
  }

  return { name, description: description || null };
}

export async function listGroups(context: AuthorizationContext): Promise<GroupListItem[]> {
  requirePermission(context, WorkspacePermission.GROUP_VIEW);
  const groups = await prisma.group.findMany({
    where: getGroupScopeFilter(context),
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { clientGroups: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group._count.clientGroups,
  }));
}

export async function getGroupDetails(context: AuthorizationContext, id: string): Promise<GroupDetails | null> {
  requirePermission(context, WorkspacePermission.GROUP_VIEW);
  const group = await prisma.group.findFirst({
    where: { id, ...getGroupScopeFilter(context) },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { clientGroups: true } },
      clientGroups: {
        where: hasPermission(context, WorkspacePermission.CONTACT_VIEW)
          ? { client: getClientScopeFilter(context) }
          : { clientId: { in: [] } },
        select: {
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
              company: true,
              optIn: true,
            },
          },
        },
        orderBy: { client: { name: "asc" } },
      },
    },
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group._count.clientGroups,
    members: group.clientGroups.map(({ client }) => client),
  };
}

export async function createGroup(context: AuthorizationContext, input: GroupInput) {
  requirePermission(context, WorkspacePermission.GROUP_CREATE);
  return prisma.$transaction(async (transaction) => {
    const group = await transaction.group.create({ data: { ...normalizeGroupInput(input), workspaceId: context.workspaceId } });
    if (!hasAllGroups(context)) await grantMemberGroupAccess(transaction, context.memberId, group.id);
    return group;
  });
}

export async function updateGroup(context: AuthorizationContext, id: string, input: GroupInput) {
  requirePermission(context, WorkspacePermission.GROUP_EDIT);
  const result = await prisma.group.updateMany({ where: { id, ...getGroupScopeFilter(context) }, data: normalizeGroupInput(input) });
  if (!result.count) throw new GroupValidationError("El grupo no está disponible.");
  return result;
}

export async function deleteGroup(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.GROUP_DELETE);
  const result = await prisma.group.deleteMany({ where: { id, ...getGroupScopeFilter(context) } });
  if (!result.count) throw new GroupValidationError("El grupo no está disponible.");
  return result;
}

export async function addClientsToGroup(context: AuthorizationContext, groupId: string, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  const uniqueClientIds = [...new Set(clientIds)];

  if (uniqueClientIds.length === 0) {
    throw new GroupValidationError("Seleccioná al menos un cliente.");
  }

  return prisma.$transaction(async (transaction) => {
    const [groups, clients] = await Promise.all([
      transaction.group.count({ where: { id: groupId, ...getGroupScopeFilter(context) } }),
      transaction.client.count({ where: { id: { in: uniqueClientIds }, ...getClientScopeFilter(context) } }),
    ]);
    if (groups !== 1 || clients !== uniqueClientIds.length) throw new GroupValidationError("No tenés acceso al grupo o a los clientes seleccionados.");
    return transaction.clientGroup.createMany({ data: uniqueClientIds.map((clientId) => ({ groupId, clientId })), skipDuplicates: true });
  });
}

export async function removeClientFromGroup(context: AuthorizationContext, groupId: string, clientId: string) {
  requirePermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  return prisma.$transaction(async (transaction) => {
    const [visibleGroup, visibleClient] = await Promise.all([
      transaction.group.count({ where: { id: groupId, ...getGroupScopeFilter(context) } }),
      transaction.client.count({ where: { id: clientId, ...getClientScopeFilter(context) } }),
    ]);
    if (visibleGroup !== 1 || visibleClient !== 1) {
      throw new GroupValidationError("El grupo o contacto no está disponible.");
    }
    return transaction.clientGroup.deleteMany({ where: { clientId, groupId, group: getGroupScopeFilter(context), client: getClientScopeFilter(context) } });
  });
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

async function ensureAccessibleClients(context: AuthorizationContext, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  const ids = uniqueIds(clientIds);
  if (!ids.length) throw new GroupValidationError("Seleccioná al menos un contacto.");
  const count = await prisma.client.count({ where: { id: { in: ids }, ...getClientScopeFilter(context) } });
  if (count !== ids.length) throw new GroupValidationError("No tenés acceso a uno de los contactos seleccionados.");
  return ids;
}

export async function addSelectedClientsToGroup(context: AuthorizationContext, groupId: string, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  const ids = await ensureAccessibleClients(context, clientIds);
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findFirst({ where: { id: groupId, ...getGroupScopeFilter(context) }, select: { id: true } });
    if (!group) throw new GroupValidationError("El grupo seleccionado no existe.");
    const result = await tx.clientGroup.createMany({ data: ids.map((clientId) => ({ groupId, clientId })), skipDuplicates: true });
    return { added: result.count, unchanged: ids.length - result.count };
  });
}

export async function removeSelectedClientsFromGroup(context: AuthorizationContext, groupId: string, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  const ids = await ensureAccessibleClients(context, clientIds);
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findFirst({ where: { id: groupId, ...getGroupScopeFilter(context) }, select: { id: true } });
    if (!group) throw new GroupValidationError("El grupo seleccionado no existe.");
    const result = await tx.clientGroup.deleteMany({ where: { groupId, clientId: { in: ids }, client: getClientScopeFilter(context) } });
    return { removed: result.count, unchanged: ids.length - result.count };
  });
}

export async function createGroupWithSelectedClients(context: AuthorizationContext, input: GroupInput, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.GROUP_CREATE);
  requirePermission(context, WorkspacePermission.GROUP_MANAGE_MEMBERS);
  const ids = await ensureAccessibleClients(context, clientIds);
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.create({ data: { ...normalizeGroupInput(input), workspaceId: context.workspaceId } });
    if (!hasAllGroups(context)) await grantMemberGroupAccess(tx, context.memberId, group.id);
    await tx.clientGroup.createMany({ data: ids.map((clientId) => ({ groupId: group.id, clientId })) });
    return group;
  });
}
