import "server-only";

import { Prisma } from "@prisma/client";

import { getCaseScopeFilter } from "@/lib/case-repository";
import { getClientScopeFilter, type AuthorizationContext } from "@/lib/authorization";
import { CASE_TYPE } from "@/lib/case-types";
import { prisma } from "@/lib/prisma";

type TicketReader = Prisma.TransactionClient | typeof prisma;

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

export const ticketInclude = {
  contact: { select: { id: true, name: true, phone: true, email: true, company: true } },
  ticketDetails: {
    include: { assignedMember: { select: identitySelect } },
  },
  ticketParticipants: {
    include: { member: { select: identitySelect } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  ticketNotes: {
    include: { authorMember: { select: identitySelect } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
} satisfies Prisma.CaseInclude;

export function getTicketScopeFilter(context: AuthorizationContext): Prisma.CaseWhereInput {
  return { ...getCaseScopeFilter(context), type: CASE_TYPE.TICKET, ticketDetails: { isNot: null } };
}

export function findTicketById(
  context: AuthorizationContext,
  id: string,
  reader: TicketReader = prisma,
) {
  return reader.case.findFirst({ where: { id, ...getTicketScopeFilter(context) }, include: ticketInclude });
}

export function findTicketByNumber(
  context: AuthorizationContext,
  number: number,
  reader: TicketReader = prisma,
) {
  return reader.case.findFirst({ where: { number, ...getTicketScopeFilter(context) }, include: ticketInclude });
}

export type TicketListFilters = {
  query?: string;
  status?: string;
  priority?: string;
  assignedMemberId?: string;
  contactId?: string;
  page: number;
  pageSize: number;
};

export async function findTickets(context: AuthorizationContext, filters: TicketListFilters) {
  const search = filters.query?.trim();
  const parsedNumber = search && /^#?\d+$/.test(search) ? Number(search.replace(/^#/, "")) : null;
  const assignedFilter = filters.assignedMemberId === "unassigned"
    ? { ticketDetails: { is: { assignedMemberId: null } } }
    : filters.assignedMemberId
      ? { ticketDetails: { is: { assignedMemberId: filters.assignedMemberId } } }
      : {};
  const where: Prisma.CaseWhereInput = {
    ...getTicketScopeFilter(context),
    ...assignedFilter,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(search ? {
      OR: [
        ...(parsedNumber && Number.isSafeInteger(parsedNumber) ? [{ number: parsedNumber }] : []),
        { title: { contains: search, mode: "insensitive" } },
        { contact: { is: { name: { contains: search, mode: "insensitive" } } } },
        { contact: { is: { phone: { contains: search, mode: "insensitive" } } } },
        { contact: { is: { email: { contains: search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const include = {
    contact: { select: { id: true, name: true, phone: true, email: true } },
    ticketDetails: { include: { assignedMember: { select: identitySelect } } },
  } satisfies Prisma.CaseInclude;
  const [items, total] = await Promise.all([
    prisma.case.findMany({ where, include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.case.count({ where }),
  ]);
  return { items, total };
}

export function listTicketContacts(context: AuthorizationContext) {
  return prisma.client.findMany({
    where: getClientScopeFilter(context),
    select: { id: true, name: true, phone: true, email: true, clientGroups: { select: { groupId: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export function listTicketMembers(context: AuthorizationContext, reader: TicketReader = prisma) {
  return reader.workspaceMember.findMany({
    where: { workspaceId: context.workspaceId },
    include: {
      permissionOverrides: { select: { permission: true, allowed: true } },
      groupAccess: { select: { groupId: true } },
      acceptedInvitations: {
        where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export function listRecentTicketsForContact(context: AuthorizationContext, contactId: string, take = 5) {
  return prisma.case.findMany({
    where: { ...getTicketScopeFilter(context), contactId },
    select: { number: true, title: true, status: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
  });
}

export function findTicketTimeline(context: AuthorizationContext, caseId: string) {
  return prisma.activity.findMany({
    where: { workspaceId: context.workspaceId, entityType: "CASE", entityId: caseId },
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
