import "server-only";

import { WorkspacePermission } from "@prisma/client";
import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function getEmailConnections(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.WORKSPACE_SETTINGS_VIEW);
  return prisma.emailConnection.findMany({ where: { workspaceId: context.workspaceId },
    select: { id: true, address: true, displayName: true, provider: true, status: true }, orderBy: { address: "asc" },
  });
}
