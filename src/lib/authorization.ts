import "server-only";

import { GroupScopeMode, Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { getWorkspaceContextIfAvailable, requireWorkspaceContext } from "@/lib/workspace-context";

export class AuthorizationError extends Error {}

export type AuthorizationContext = Awaited<ReturnType<typeof requireWorkspaceContext>> & {
  permissions: ReadonlySet<WorkspacePermission>;
};

export async function getAuthorizationContext(): Promise<AuthorizationContext> {
  return withPermissions(await requireWorkspaceContext());
}

export async function getAuthorizationContextIfAvailable(userId: string): Promise<AuthorizationContext | null> {
  const context = await getWorkspaceContextIfAvailable(userId);
  return context ? withPermissions(context) : null;
}

async function withPermissions(context: Awaited<ReturnType<typeof requireWorkspaceContext>>): Promise<AuthorizationContext> {
  const overrides = context.role === WorkspaceRole.OWNER ? [] : await prisma.memberPermission.findMany({
    where: { memberId: context.memberId },
    select: { permission: true, allowed: true },
  });
  return { ...context, permissions: getEffectivePermissions(context.role, overrides) };
}

export function hasPermission(context: AuthorizationContext, permission: WorkspacePermission) {
  return context.permissions.has(permission);
}

export function requirePermission(context: AuthorizationContext, permission: WorkspacePermission) {
  if (!hasPermission(context, permission)) {
    throw new AuthorizationError("No tenés permiso para realizar esta acción.");
  }
}

export function hasAllGroups(context: AuthorizationContext) {
  return context.role === WorkspaceRole.OWNER || context.groupScopeMode === GroupScopeMode.ALL;
}

export function getGroupScopeFilter(context: AuthorizationContext): Prisma.GroupWhereInput {
  return {
    workspaceId: context.workspaceId,
    ...(!hasAllGroups(context) ? { memberAccess: { some: { memberId: context.memberId } } } : {}),
  };
}

export function getClientScopeFilter(context: AuthorizationContext): Prisma.ClientWhereInput {
  return {
    workspaceId: context.workspaceId,
    ...(!hasAllGroups(context) ? {
      clientGroups: {
        some: { group: getGroupScopeFilter(context) },
      },
    } : {}),
  };
}

export async function getAccessibleGroupIds(context: AuthorizationContext) {
  const groups = await prisma.group.findMany({ where: getGroupScopeFilter(context), select: { id: true } });
  return groups.map(({ id }) => id);
}

export async function canAccessGroup(context: AuthorizationContext, groupId: string) {
  return (await prisma.group.count({ where: { id: groupId, ...getGroupScopeFilter(context) } })) === 1;
}

export async function canAccessClient(context: AuthorizationContext, clientId: string) {
  return (await prisma.client.count({ where: { id: clientId, ...getClientScopeFilter(context) } })) === 1;
}

export async function grantMemberGroupAccess(transaction: Prisma.TransactionClient, memberId: string, groupId: string) {
  const [member, group] = await Promise.all([
    transaction.workspaceMember.findUnique({ where: { id: memberId }, select: { workspaceId: true } }),
    transaction.group.findUnique({ where: { id: groupId }, select: { workspaceId: true } }),
  ]);
  if (!member || !group || member.workspaceId !== group.workspaceId) {
    throw new AuthorizationError("No se puede asignar acceso a un grupo de otra cartera.");
  }
  return transaction.memberGroupAccess.upsert({
    where: { memberId_groupId: { memberId, groupId } },
    create: { memberId, groupId },
    update: {},
  });
}
