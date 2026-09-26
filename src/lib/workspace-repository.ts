import { Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import type { AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { NEW_WORKSPACE_MODULE_DEFAULTS } from "@/lib/workspace-modules";

export class WorkspaceValidationError extends Error {}
export class MultipleWorkspacesError extends Error {}

const MAX_BOOTSTRAP_ATTEMPTS = 5;

export async function getOrCreateDefaultWorkspace(userId: string) {
  for (let attempt = 1; attempt <= MAX_BOOTSTRAP_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

          const existing = await transaction.workspaceMember.findMany({
            where: { userId },
            include: { workspace: true },
            orderBy: { createdAt: "asc" },
            take: 2,
          });

          if (existing.length > 1) throw new MultipleWorkspacesError("Elegí la cartera que querés abrir.");
          if (existing.length === 1) return existing[0];

          const workspace = await transaction.workspace.create({
            data: {
              name: "Mi cartera",
              members: { create: { userId, role: WorkspaceRole.OWNER } },
              modules: {
                create: Object.entries(NEW_WORKSPACE_MODULE_DEFAULTS).map(([key, enabled]) => ({ key, enabled })),
              },
            },
            include: { members: { where: { userId } } },
          });

          return { ...workspace.members[0], workspace };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") {
        throw error;
      }
      if (attempt === MAX_BOOTSTRAP_ATTEMPTS) {
        throw new Error("No se pudo crear la cartera por solicitudes simultáneas. Volvé a intentar.", { cause: error });
      }
    }
  }

  throw new Error("No se pudo resolver la cartera.");
}

export async function updateWorkspace(
  context: AuthorizationContext,
  input: { name: string; description: string },
) {
  if (!context.permissions.has(WorkspacePermission.WORKSPACE_SETTINGS_EDIT)) {
    throw new WorkspaceValidationError("No tenés permiso para modificar esta cartera.");
  }
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) throw new WorkspaceValidationError("El nombre de la cartera es obligatorio.");
  if (name.length > 120) throw new WorkspaceValidationError("El nombre no puede superar 120 caracteres.");
  if (description.length > 1000) throw new WorkspaceValidationError("La descripción no puede superar 1000 caracteres.");

  await prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findFirst({ where: { id: context.workspaceId, members: { some: { id: context.memberId, userId: context.userId } } }, select: { id: true, name: true, description: true } });
    if (!workspace) throw new WorkspaceValidationError("No tenés acceso a esta cartera.");
    const data = { name, description: description || null };
    const changedFields = (["name", "description"] as const).filter((field) => workspace[field] !== data[field]);
    if (!changedFields.length) return;
    await transaction.workspace.update({ where: { id: workspace.id }, data });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.WORKSPACE, entityId: workspace.id, action: ACTIVITY_ACTION.WORKSPACE_UPDATED, metadata: { changedFields } }, transaction);
  });
}
