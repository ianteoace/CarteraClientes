import "server-only";

import { Prisma } from "@prisma/client";

import { getCaseScopeFilter } from "@/lib/case-repository";
import type { AuthorizationContext } from "@/lib/authorization";
import { CASE_TYPE } from "@/lib/case-types";
import { getTicketScopeFilter } from "@/lib/ticket-repository";
import { prisma } from "@/lib/prisma";

type IncidentReader = Prisma.TransactionClient | typeof prisma;

const identitySelect = {
  id: true,
  userId: true,
  acceptedInvitations: {
    where: { acceptedAt: { not: null } },
    select: { email: true },
    orderBy: { acceptedAt: "desc" as const },
    take: 1,
  },
};

export function getIncidentScopeFilter(context: AuthorizationContext): Prisma.CaseWhereInput {
  return { ...getCaseScopeFilter(context), type: CASE_TYPE.INCIDENT, incidentDetails: { isNot: null } };
}

export const incidentInclude = {
    incidentDetails: { include: { assignedMember: { select: identitySelect } } },
    incidentParticipants: {
      include: { member: { select: identitySelect } },
      orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    },
    incidentNotes: {
      include: { authorMember: { select: identitySelect } },
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    },
    incidentTicketLinks: {
      include: {
        ticketCase: {
          include: { contact: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ createdAt: "asc" as const }, { ticketCaseId: "asc" as const }],
    },
} satisfies Prisma.CaseInclude;

export function findIncidentById(
  context: AuthorizationContext,
  id: string,
  reader: IncidentReader = prisma,
) {
  return reader.case.findFirst({ where: { id, ...getIncidentScopeFilter(context) }, include: incidentInclude });
}

export function findIncidentByNumber(
  context: AuthorizationContext,
  number: number,
  reader: IncidentReader = prisma,
) {
  return reader.case.findFirst({ where: { number, ...getIncidentScopeFilter(context) }, include: incidentInclude });
}

export type IncidentListFilters = {
  query?: string;
  status?: string;
  priority?: string;
  assignedMemberId?: string;
  page: number;
  pageSize: number;
};

export async function findIncidents(context: AuthorizationContext, filters: IncidentListFilters) {
  const search = filters.query?.trim();
  const parsedNumber = search && /^#?\d+$/.test(search) ? Number(search.replace(/^#/, "")) : null;
  const assignedFilter = filters.assignedMemberId === "unassigned"
    ? { incidentDetails: { is: { assignedMemberId: null } } }
    : filters.assignedMemberId
      ? { incidentDetails: { is: { assignedMemberId: filters.assignedMemberId } } }
      : {};
  const where: Prisma.CaseWhereInput = {
    ...getIncidentScopeFilter(context),
    ...assignedFilter,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(search ? { OR: [
      ...(parsedNumber && Number.isSafeInteger(parsedNumber) ? [{ number: parsedNumber }] : []),
      { title: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const include = {
    incidentDetails: { include: { assignedMember: { select: identitySelect } } },
    _count: { select: { incidentTicketLinks: true } },
  } satisfies Prisma.CaseInclude;
  const [items, total] = await Promise.all([
    prisma.case.findMany({ where, include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.case.count({ where }),
  ]);
  return { items, total };
}

export function listIncidentMembers(context: AuthorizationContext, reader: IncidentReader = prisma) {
  return reader.workspaceMember.findMany({
    where: { workspaceId: context.workspaceId },
    include: {
      permissionOverrides: { select: { permission: true, allowed: true } },
      acceptedInvitations: {
        where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export function listAvailableTicketsForIncident(context: AuthorizationContext, incidentCaseId: string, query = "") {
  const search = query.trim();
  const parsedNumber = search && /^#?\d+$/.test(search) ? Number(search.replace(/^#/, "")) : null;
  return prisma.case.findMany({
    where: {
      ...getTicketScopeFilter(context),
      ticketIncidentLinks: { none: { incidentCaseId } },
      ...(search ? { OR: [
        ...(parsedNumber && Number.isSafeInteger(parsedNumber) ? [{ number: parsedNumber }] : []),
        { title: { contains: search, mode: "insensitive" } },
        { contact: { is: { name: { contains: search, mode: "insensitive" } } } },
      ] } : {}),
    },
    select: { id: true, number: true, title: true, status: true, contact: { select: { name: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
  });
}

export function findIncidentTimeline(context: AuthorizationContext, caseId: string) {
  return prisma.activity.findMany({
    where: { workspaceId: context.workspaceId, entityType: "CASE", entityId: caseId },
    include: { actorMember: { select: { userId: true, acceptedInvitations: {
      where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1,
    } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export function listRelatedIncidentsForTicket(context: AuthorizationContext, ticketCaseId: string) {
  return prisma.incidentTicket.findMany({
    where: { ticketCaseId, incidentCase: getIncidentScopeFilter(context) },
    select: { incidentCase: { select: { id: true, number: true, title: true, status: true } } },
    orderBy: [{ createdAt: "asc" }, { incidentCaseId: "asc" }],
  });
}
