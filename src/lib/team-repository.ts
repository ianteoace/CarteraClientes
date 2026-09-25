import "server-only";

import { GroupScopeMode, Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import { AuthorizationContext, AuthorizationError, getGroupScopeFilter, requirePermission } from "@/lib/authorization";
import { getEffectivePermissions, ROLE_PERMISSION_PRESETS } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";

export class TeamMemberNotFoundError extends Error {}

const memberInclude = {
  permissionOverrides: { select: { permission: true, allowed: true } },
  groupAccess: { select: { groupId: true } },
  acceptedInvitations: { where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1 },
} satisfies Prisma.WorkspaceMemberInclude;

export async function currentActor(transaction: Prisma.TransactionClient, context: AuthorizationContext) {
  const member = await transaction.workspaceMember.findFirst({
    where: { id: context.memberId, userId: context.userId, workspaceId: context.workspaceId },
    include: { permissionOverrides: { select: { permission: true, allowed: true } } },
  });
  if (!member) throw new AuthorizationError("Ya no pertenecés a esta cartera.");
  return {
    ...member,
    permissions: getEffectivePermissions(member.role, member.permissionOverrides),
  };
}

export function requireActorPermission(actor: Awaited<ReturnType<typeof currentActor>>, permission: WorkspacePermission) {
  if (!actor.permissions.has(permission)) throw new AuthorizationError("No tenés permiso para realizar esta acción.");
}

async function targetMember(transaction: Prisma.TransactionClient, context: AuthorizationContext, memberId: string) {
  const member = await transaction.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: context.workspaceId },
    include: memberInclude,
  });
  if (!member) throw new TeamMemberNotFoundError("El miembro no pertenece a esta cartera.");
  return member;
}

function protectOwner(actor: Awaited<ReturnType<typeof currentActor>>, targetRole: WorkspaceRole) {
  if (actor.role !== WorkspaceRole.OWNER && targetRole === WorkspaceRole.OWNER) {
    throw new AuthorizationError("Solo un Owner puede modificar a otro Owner.");
  }
}

export async function listTeamMembers(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.TEAM_VIEW);
  return prisma.workspaceMember.findMany({ where: { workspaceId: context.workspaceId }, include: memberInclude });
}

export async function getTeamMember(context: AuthorizationContext, memberId: string) {
  requirePermission(context, WorkspacePermission.TEAM_VIEW);
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: context.workspaceId }, include: memberInclude,
  });
  if (!member) throw new TeamMemberNotFoundError("El miembro no pertenece a esta cartera.");
  return member;
}

export async function listManageableGroups(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.TEAM_VIEW);
  return prisma.group.findMany({ where: getGroupScopeFilter(context), select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function changeMemberRole(context: AuthorizationContext, memberId: string, role: WorkspaceRole) {
  if (!Object.values(WorkspaceRole).includes(role)) throw new AuthorizationError("Seleccioná un rol válido.");
  return prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.TEAM_MANAGE);
    const target = await targetMember(transaction, context, memberId);
    protectOwner(actor, target.role);
    if (actor.role !== WorkspaceRole.OWNER && role === WorkspaceRole.OWNER) {
      throw new AuthorizationError("Solo un Owner puede otorgar el rol Owner.");
    }
    if (actor.role !== WorkspaceRole.OWNER && ROLE_PERMISSION_PRESETS[role].some((permission) => !actor.permissions.has(permission))) {
      throw new AuthorizationError("No podés asignar un rol con permisos que no tenés.");
    }
    if (target.role === role) return target;
    if (target.role === WorkspaceRole.OWNER) {
      if (target.id === actor.id) throw new AuthorizationError("No podés cambiar tu propio rol Owner.");
      const ownerCount = await transaction.workspaceMember.count({ where: { workspaceId: context.workspaceId, role: WorkspaceRole.OWNER } });
      if (ownerCount <= 1) throw new AuthorizationError("La cartera debe conservar al menos un Owner.");
    }
    await transaction.memberPermission.deleteMany({ where: { memberId: target.id } });
    if (role === WorkspaceRole.OWNER) {
      await transaction.memberGroupAccess.deleteMany({ where: { memberId: target.id } });
    }
    return transaction.workspaceMember.update({
      where: { id: target.id },
      data: { role, ...(role === WorkspaceRole.OWNER ? { groupScopeMode: GroupScopeMode.ALL } : {}) },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setMemberPermission(context: AuthorizationContext, memberId: string, permission: WorkspacePermission, allowed: boolean) {
  if (!Object.values(WorkspacePermission).includes(permission) || typeof allowed !== "boolean") {
    throw new AuthorizationError("Seleccioná un permiso válido.");
  }
  return prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    const target = await targetMember(transaction, context, memberId);
    protectOwner(actor, target.role);
    if (target.role === WorkspaceRole.OWNER) throw new AuthorizationError("El Owner siempre tiene acceso total.");
    if (allowed && actor.role !== WorkspaceRole.OWNER && !actor.permissions.has(permission)) {
      throw new AuthorizationError("No podés otorgar un permiso que no tenés.");
    }
    const presetAllows = ROLE_PERMISSION_PRESETS[target.role].includes(permission);
    if (allowed === presetAllows) {
      await transaction.memberPermission.deleteMany({ where: { memberId: target.id, permission } });
    } else {
      await transaction.memberPermission.upsert({
        where: { memberId_permission: { memberId: target.id, permission } },
        create: { memberId: target.id, permission, allowed },
        update: { allowed },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resetMemberPermissions(context: AuthorizationContext, memberId: string) {
  return prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    const target = await targetMember(transaction, context, memberId);
    protectOwner(actor, target.role);
    if (target.role === WorkspaceRole.OWNER) throw new AuthorizationError("El Owner siempre tiene acceso total.");
    if (actor.role !== WorkspaceRole.OWNER) {
      const effective = getEffectivePermissions(target.role, target.permissionOverrides);
      const preset = new Set(ROLE_PERMISSION_PRESETS[target.role]);
      for (const permission of preset) {
        if (!effective.has(permission) && !actor.permissions.has(permission)) {
          throw new AuthorizationError("Restaurar el rol otorgaría permisos que no tenés.");
        }
      }
    }
    return transaction.memberPermission.deleteMany({ where: { memberId: target.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateMemberGroupScope(
  context: AuthorizationContext,
  memberId: string,
  mode: GroupScopeMode,
  groupIds: string[],
) {
  if (!Object.values(GroupScopeMode).includes(mode) || !Array.isArray(groupIds) || groupIds.some((id) => typeof id !== "string")) {
    throw new AuthorizationError("Seleccioná un alcance válido.");
  }
  const uniqueIds = [...new Set(groupIds)];
  return prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    const target = await targetMember(transaction, context, memberId);
    protectOwner(actor, target.role);
    if (target.role === WorkspaceRole.OWNER) throw new AuthorizationError("El Owner siempre accede a todos los grupos.");
    if (actor.role !== WorkspaceRole.OWNER && actor.groupScopeMode !== GroupScopeMode.ALL && mode === GroupScopeMode.ALL) {
      throw new AuthorizationError("No podés otorgar acceso a grupos fuera de tu alcance.");
    }
    if (mode === GroupScopeMode.SELECTED && uniqueIds.length) {
      const groups = await transaction.group.findMany({
        where: {
          id: { in: uniqueIds }, workspaceId: context.workspaceId,
          ...(actor.role !== WorkspaceRole.OWNER && actor.groupScopeMode === GroupScopeMode.SELECTED
            ? { memberAccess: { some: { memberId: actor.id } } } : {}),
        },
        select: { id: true },
      });
      if (groups.length !== uniqueIds.length) throw new AuthorizationError("Uno o más grupos no pertenecen a esta cartera o están fuera de tu alcance.");
    }
    const manageableIds = actor.role !== WorkspaceRole.OWNER && actor.groupScopeMode === GroupScopeMode.SELECTED
      ? (await transaction.memberGroupAccess.findMany({ where: { memberId: actor.id }, select: { groupId: true } })).map(({ groupId }) => groupId)
      : null;
    await transaction.memberGroupAccess.deleteMany({
      where: { memberId: target.id, ...(manageableIds ? { groupId: { in: manageableIds } } : {}) },
    });
    if (mode === GroupScopeMode.SELECTED && uniqueIds.length) {
      await transaction.memberGroupAccess.createMany({ data: uniqueIds.map((groupId) => ({ memberId: target.id, groupId })) });
    }
    return transaction.workspaceMember.update({ where: { id: target.id }, data: { groupScopeMode: mode } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
