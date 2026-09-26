import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { KNOWN_MODULES, type WorkspaceModuleKey } from "@/lib/workspace-modules";

type Writer = Prisma.TransactionClient | typeof prisma;

export async function findWorkspaceModules(workspaceId: string, writer: Writer = prisma) {
  return writer.workspaceModule.findMany({
    where: { workspaceId, key: { in: [...KNOWN_MODULES] } },
    select: { key: true, enabled: true },
  });
}

export async function upsertWorkspaceModule(
  workspaceId: string,
  key: WorkspaceModuleKey,
  enabled: boolean,
  writer: Writer = prisma,
) {
  return writer.workspaceModule.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, enabled },
    update: { enabled },
  });
}
