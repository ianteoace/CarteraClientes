import "server-only";

import { Prisma, WorkspacePermission } from "@prisma/client";

import { ACTIVITY_ENTITY, ACTIVITY_FILTERS, type ActivityFilter } from "@/lib/activity-types";
import { getAccessibleGroupIds, getClientScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

export function normalizeActivityFilter(value?: string): ActivityFilter {
  return value && value in ACTIVITY_FILTERS ? value as ActivityFilter : "all";
}

export async function listWorkspaceActivity(context: AuthorizationContext, filter: ActivityFilter, page = 1) {
  requirePermission(context, WorkspacePermission.TEAM_VIEW);
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
  const entityType = ACTIVITY_FILTERS[filter];
  const where: Prisma.ActivityWhereInput = { workspaceId: context.workspaceId, ...(entityType ? { entityType } : {}) };

  if (!hasAllGroups(context)) {
    const [groupIds, clients, cases] = await Promise.all([
      getAccessibleGroupIds(context),
      prisma.client.findMany({ where: getClientScopeFilter(context), select: { id: true } }),
      prisma.case.findMany({
        where: { workspaceId: context.workspaceId, contact: { is: getClientScopeFilter(context) } },
        select: { id: true },
      }),
    ]);
    const clientIds = clients.map(({ id }) => id);
    const caseIds = cases.map(({ id }) => id);
    where.AND = [{
      OR: [
        { entityType: { notIn: [ACTIVITY_ENTITY.CONTACT, ACTIVITY_ENTITY.GROUP, ACTIVITY_ENTITY.CASE] } },
        { entityType: ACTIVITY_ENTITY.CONTACT, entityId: { in: clientIds } },
        { entityType: ACTIVITY_ENTITY.GROUP, entityId: { in: groupIds } },
        { entityType: ACTIVITY_ENTITY.CASE, entityId: { in: caseIds } },
      ],
    }];
  }

  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: {
        actorMember: {
          select: {
            userId: true,
            acceptedInvitations: {
              where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1,
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.activity.count({ where }),
  ]);

  return { items, page: safePage, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), total };
}
