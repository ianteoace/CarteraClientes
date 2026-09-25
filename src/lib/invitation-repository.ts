import "server-only";

import { GroupScopeMode, Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import { AuthorizationContext, AuthorizationError, requirePermission } from "@/lib/authorization";
import { sendWorkspaceInvitationEmail } from "@/lib/invitation-email";
import { getInvitationStatus } from "@/lib/invitation-status";
import {
  generateInvitationToken, hashInvitationToken, INVITATION_HOURLY_LIMIT,
  INVITATION_SEND_COOLDOWN_MS, INVITATION_TTL_MS,
} from "@/lib/invitation-token";
import { ROLE_PERMISSION_PRESETS } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { currentActor, requireActorPermission } from "@/lib/team-repository";

export type InvitationErrorCode = "INVALID" | "EXPIRED" | "REVOKED" | "ACCEPTED" | "EMAIL_MISMATCH" | "EMAIL_UNVERIFIED" | "VALIDATION";

export class InvitationValidationError extends Error {
  constructor(message: string, public code: InvitationErrorCode = "VALIDATION") { super(message); }
}

const invitationEmailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const allowedRoles = [WorkspaceRole.ADMIN, WorkspaceRole.AGENT, WorkspaceRole.VIEWER] as const;

export function normalizeInvitationEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !invitationEmailPattern.test(normalized)) {
    throw new InvitationValidationError("Ingresá un email válido.");
  }
  return normalized;
}

function validateRole(role: WorkspaceRole) {
  if (!allowedRoles.includes(role as typeof allowedRoles[number])) {
    throw new InvitationValidationError("Seleccioná Administrador, Agente o Solo lectura.");
  }
}

function validateGroupIds(groupIds: string[]) {
  if (!Array.isArray(groupIds) || groupIds.length > 500 || groupIds.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    throw new InvitationValidationError("La selección de grupos no es válida.");
  }
  return [...new Set(groupIds)];
}

async function validateScope(
  transaction: Prisma.TransactionClient,
  actor: Awaited<ReturnType<typeof currentActor>>,
  workspaceId: string,
  mode: GroupScopeMode,
  groupIds: string[],
) {
  if (!Object.values(GroupScopeMode).includes(mode)) throw new InvitationValidationError("Seleccioná un alcance válido.");
  if (mode === GroupScopeMode.ALL) {
    if (groupIds.length) throw new InvitationValidationError("El acceso a todos los grupos no lleva una selección individual.");
    if (actor.role !== WorkspaceRole.OWNER && actor.groupScopeMode !== GroupScopeMode.ALL) {
      throw new AuthorizationError("No podés conceder acceso fuera de tu alcance.");
    }
    return;
  }
  if (!groupIds.length) return;
  const valid = await transaction.group.count({
    where: {
      id: { in: groupIds }, workspaceId,
      ...(actor.role !== WorkspaceRole.OWNER && actor.groupScopeMode === GroupScopeMode.SELECTED
        ? { memberAccess: { some: { memberId: actor.id } } } : {}),
    },
  });
  if (valid !== groupIds.length) throw new InvitationValidationError("Uno o más grupos no pertenecen a esta cartera o están fuera de tu alcance.");
}

async function withRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code) || attempt === 2) throw error;
    }
  }
  throw new Error("No se pudo completar la operación.");
}

export async function createWorkspaceInvitation(
  context: AuthorizationContext,
  input: { email: string; role: WorkspaceRole; groupScopeMode: GroupScopeMode; groupIds: string[] },
  actorEmail: string,
) {
  const email = normalizeInvitationEmail(input.email);
  validateRole(input.role);
  const groupIds = validateGroupIds(input.groupIds);
  if (email === actorEmail.trim().toLowerCase()) {
    throw new InvitationValidationError("Ya pertenecés a esta cartera.");
  }
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token)!;
  const now = new Date();

  const invitation = await withRetry(() => prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.TEAM_MANAGE);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    if (actor.role !== WorkspaceRole.OWNER && ROLE_PERMISSION_PRESETS[input.role].some((permission) => !actor.permissions.has(permission))) {
      throw new AuthorizationError("No podés invitar con permisos que no tenés.");
    }
    await validateScope(transaction, actor, context.workspaceId, input.groupScopeMode, groupIds);

    const knownMember = await transaction.workspaceInvitation.findFirst({
      where: {
        workspaceId: context.workspaceId, email, acceptedAt: { not: null },
        acceptedMember: { workspaceId: context.workspaceId },
      },
      select: { id: true },
    });
    if (knownMember) throw new InvitationValidationError("Este email ya pertenece a un miembro de la cartera.");

    const recentCount = await transaction.workspaceInvitation.count({
      where: { workspaceId: context.workspaceId, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (recentCount >= INVITATION_HOURLY_LIMIT) {
      throw new InvitationValidationError("Se alcanzó el límite de invitaciones por hora. Intentá más tarde.");
    }
    const prior = await transaction.workspaceInvitation.findFirst({
      where: { workspaceId: context.workspaceId, email, acceptedAt: null, revokedAt: null },
      select: { id: true, emailAttemptedAt: true },
    });
    if (prior?.emailAttemptedAt && now.getTime() - prior.emailAttemptedAt.getTime() < INVITATION_SEND_COOLDOWN_MS) {
      throw new InvitationValidationError("Esperá un minuto antes de volver a invitar a este email.");
    }
    if (prior) await transaction.workspaceInvitation.update({ where: { id: prior.id }, data: { revokedAt: now } });

    return transaction.workspaceInvitation.create({
      data: {
        workspaceId: context.workspaceId, email, role: input.role, groupScopeMode: input.groupScopeMode,
        tokenHash, invitedByMemberId: actor.id, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        emailAttemptedAt: now,
        ...(input.groupScopeMode === GroupScopeMode.SELECTED && groupIds.length
          ? { groupAccess: { create: groupIds.map((groupId) => ({ groupId })) } } : {}),
      },
      include: { workspace: { select: { name: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

  return { invitation, token };
}

export async function listWorkspaceInvitations(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.TEAM_VIEW);
  return prisma.workspaceInvitation.findMany({
    where: { workspaceId: context.workspaceId, acceptedAt: null },
    select: {
      id: true, email: true, role: true, groupScopeMode: true, expiresAt: true,
      acceptedAt: true, revokedAt: true, emailSentAt: true, createdAt: true,
      _count: { select: { groupAccess: true } },
    },
    orderBy: { createdAt: "desc" }, take: 50,
  });
}

export async function resendWorkspaceInvitation(context: AuthorizationContext, invitationId: string) {
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token)!;
  const now = new Date();
  const invitation = await withRetry(() => prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.TEAM_MANAGE);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    const existing = await transaction.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId: context.workspaceId },
      include: { workspace: { select: { name: true } }, groupAccess: { select: { groupId: true } } },
    });
    if (!existing) throw new InvitationValidationError("La invitación no pertenece a esta cartera.", "INVALID");
    if (existing.acceptedAt || existing.revokedAt) throw new InvitationValidationError("Esta invitación ya no puede reenviarse.");
    if (actor.role !== WorkspaceRole.OWNER && ROLE_PERMISSION_PRESETS[existing.role].some((permission) => !actor.permissions.has(permission))) {
      throw new AuthorizationError("No podés reenviar una invitación con permisos que no tenés.");
    }
    await validateScope(transaction, actor, context.workspaceId, existing.groupScopeMode, existing.groupAccess.map(({ groupId }) => groupId));
    if (existing.emailAttemptedAt && now.getTime() - existing.emailAttemptedAt.getTime() < INVITATION_SEND_COOLDOWN_MS) {
      throw new InvitationValidationError("Esperá un minuto antes de reenviar esta invitación.");
    }
    return transaction.workspaceInvitation.update({
      where: { id: existing.id },
      data: { tokenHash, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), emailAttemptedAt: now, emailSentAt: null },
      include: { workspace: { select: { name: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  return { invitation, token };
}

export async function revokeWorkspaceInvitation(context: AuthorizationContext, invitationId: string) {
  return prisma.$transaction(async (transaction) => {
    const actor = await currentActor(transaction, context);
    requireActorPermission(actor, WorkspacePermission.TEAM_MANAGE);
    requireActorPermission(actor, WorkspacePermission.PERMISSIONS_MANAGE);
    const result = await transaction.workspaceInvitation.updateMany({
      where: { id: invitationId, workspaceId: context.workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new InvitationValidationError("La invitación ya no está pendiente.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deliverWorkspaceInvitation(
  issue: Awaited<ReturnType<typeof createWorkspaceInvitation>>,
  inviterName: string,
  mailer: typeof sendWorkspaceInvitationEmail = sendWorkspaceInvitationEmail,
) {
  try {
    await mailer({
      to: issue.invitation.email,
      workspaceName: issue.invitation.workspace.name,
      inviterName: inviterName.trim() || "Alguien de tu equipo",
      role: issue.invitation.role,
      expiresAt: issue.invitation.expiresAt,
      token: issue.token,
    });
    await prisma.workspaceInvitation.updateMany({
      where: { id: issue.invitation.id, tokenHash: hashInvitationToken(issue.token)! },
      data: { emailSentAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

const publicInvitationSelect = {
  id: true, workspaceId: true, email: true, role: true, groupScopeMode: true,
  expiresAt: true, acceptedAt: true, revokedAt: true,
  workspace: { select: { name: true } },
} satisfies Prisma.WorkspaceInvitationSelect;

export async function getPublicInvitation(token: string) {
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash) return null;
  return prisma.workspaceInvitation.findUnique({ where: { tokenHash }, select: publicInvitationSelect });
}

export async function acceptWorkspaceInvitation(
  token: string,
  user: { id: string; email: string; emailVerified: boolean },
) {
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash) throw new InvitationValidationError("El enlace de invitación no es válido.", "INVALID");
  return withRetry(() => prisma.$transaction(async (transaction) => {
    const invitation = await transaction.workspaceInvitation.findUnique({
      where: { tokenHash },
      include: { groupAccess: { select: { groupId: true } } },
    });
    if (!invitation) throw new InvitationValidationError("El enlace de invitación no es válido.", "INVALID");
    const status = getInvitationStatus(invitation);
    if (status !== "PENDING") {
      const messages = { ACCEPTED: "Esta invitación ya fue aceptada.", REVOKED: "Esta invitación fue revocada.", EXPIRED: "Esta invitación venció." } as const;
      throw new InvitationValidationError(messages[status], status);
    }
    if (normalizeInvitationEmail(user.email) !== invitation.email) {
      throw new InvitationValidationError("Esta invitación fue enviada a otra dirección de correo.", "EMAIL_MISMATCH");
    }
    if (!user.emailVerified) {
      throw new InvitationValidationError("Verificá tu email antes de aceptar la invitación.", "EMAIL_UNVERIFIED");
    }
    const now = new Date();
    const claimed = await transaction.workspaceInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now, acceptedByUserId: user.id },
    });
    if (!claimed.count) throw new InvitationValidationError("Esta invitación ya no está disponible.", "INVALID");

    const existing = await transaction.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
      select: { id: true },
    });
    const member = existing ?? await transaction.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId, userId: user.id,
        role: invitation.role, groupScopeMode: invitation.groupScopeMode,
      },
      select: { id: true },
    });
    if (!existing && invitation.groupScopeMode === GroupScopeMode.SELECTED && invitation.groupAccess.length) {
      const ids = invitation.groupAccess.map(({ groupId }) => groupId);
      const validGroups = await transaction.group.findMany({ where: { id: { in: ids }, workspaceId: invitation.workspaceId }, select: { id: true } });
      if (validGroups.length) await transaction.memberGroupAccess.createMany({
        data: validGroups.map(({ id: groupId }) => ({ memberId: member.id, groupId })),
      });
    }
    await transaction.workspaceInvitation.update({ where: { id: invitation.id }, data: { acceptedMemberId: member.id } });
    return { workspaceId: invitation.workspaceId, alreadyMember: Boolean(existing) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}
