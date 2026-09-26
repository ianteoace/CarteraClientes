import "server-only";

import { Prisma } from "@prisma/client";

import type { AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import type { ActivityAction, ActivityEntityType } from "@/lib/activity-types";

type ActivityWriter = Prisma.TransactionClient | typeof prisma;

export type RecordActivityInput = {
  workspaceId: string;
  actorUserId?: string | null;
  actorMemberId?: string | null;
  entityType: ActivityEntityType;
  entityId?: string | null;
  action: ActivityAction;
  metadata?: Prisma.InputJsonObject;
};

export function activityActor(context: AuthorizationContext) {
  return {
    workspaceId: context.workspaceId,
    actorUserId: context.userId,
    actorMemberId: context.memberId,
  };
}

export async function recordActivity(input: RecordActivityInput, writer: ActivityWriter = prisma) {
  return writer.activity.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      actorMemberId: input.actorMemberId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      metadata: input.metadata,
    },
  });
}

export function maskActivityEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "email protegido";
  return `${local[0]}${"*".repeat(Math.min(Math.max(local.length - 1, 1), 3))}@${domain}`;
}
