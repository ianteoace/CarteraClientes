import "server-only";

import { CampaignStatus, WorkspacePermission } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { findWorkspaceModules, upsertWorkspaceModule } from "@/lib/workspace-module-repository";
import {
  AVAILABLE_MODULES,
  KNOWN_MODULES,
  WORKSPACE_MODULE,
  isAvailableWorkspaceModule,
  isKnownWorkspaceModule,
  type WorkspaceModuleKey,
} from "@/lib/workspace-modules";

export class WorkspaceModuleError extends Error {}
export type WorkspaceModuleState = Readonly<Record<WorkspaceModuleKey, boolean>>;

export async function getWorkspaceModules(context: { workspaceId: string }): Promise<WorkspaceModuleState> {
  const rows = await findWorkspaceModules(context.workspaceId);
  const state = Object.fromEntries(KNOWN_MODULES.map((key) => [key, false])) as Record<WorkspaceModuleKey, boolean>;
  for (const row of rows) {
    if (isKnownWorkspaceModule(row.key)) state[row.key] = row.enabled;
  }
  return state;
}

export function isModuleEnabled(modules: WorkspaceModuleState, key: WorkspaceModuleKey) {
  return modules[key] === true;
}

export async function requireModule(context: { workspaceId: string }, key: WorkspaceModuleKey) {
  if (!isModuleEnabled(await getWorkspaceModules(context), key)) {
    throw new WorkspaceModuleError("Este módulo no está disponible en la cartera actual.");
  }
}

export async function updateWorkspaceModule(context: AuthorizationContext, rawKey: string, enabled: boolean) {
  requirePermission(context, WorkspacePermission.WORKSPACE_SETTINGS_EDIT);
  if (!isKnownWorkspaceModule(rawKey)) throw new WorkspaceModuleError("El módulo indicado no es válido.");
  if (!isAvailableWorkspaceModule(rawKey)) throw new WorkspaceModuleError("Este módulo todavía no está disponible.");

  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.workspaceMember.count({
      where: { id: context.memberId, userId: context.userId, workspaceId: context.workspaceId },
    });
    if (membership !== 1) throw new WorkspaceModuleError("No tenés acceso a esta cartera.");

    if (!enabled && rawKey === WORKSPACE_MODULE.CAMPAIGNS) {
      const activeCampaigns = await transaction.campaign.count({
        where: { workspaceId: context.workspaceId, status: { in: [CampaignStatus.SENDING, CampaignStatus.SCHEDULED] } },
      });
      if (activeCampaigns > 0) {
        throw new WorkspaceModuleError("No podés desactivar Campañas mientras haya envíos en curso o programados.");
      }
    }

    const current = await transaction.workspaceModule.findUnique({
      where: { workspaceId_key: { workspaceId: context.workspaceId, key: rawKey } },
      select: { enabled: true },
    });
    if (current?.enabled === enabled) return { changed: false, enabled };

    await upsertWorkspaceModule(context.workspaceId, rawKey, enabled, transaction);
    await recordActivity({
      ...activityActor(context),
      entityType: ACTIVITY_ENTITY.WORKSPACE,
      entityId: context.workspaceId,
      action: enabled ? ACTIVITY_ACTION.WORKSPACE_MODULE_ENABLED : ACTIVITY_ACTION.WORKSPACE_MODULE_DISABLED,
      metadata: { module: rawKey },
    }, transaction);
    return { changed: true, enabled };
  });
}

export { AVAILABLE_MODULES };
