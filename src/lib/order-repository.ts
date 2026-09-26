import "server-only";

import { Prisma } from "@prisma/client";

import { getClientScopeFilter, type AuthorizationContext } from "@/lib/authorization";
import { getCaseScopeFilter } from "@/lib/case-repository";
import { CASE_TYPE } from "@/lib/case-types";
import { prisma } from "@/lib/prisma";

type OrderReader = Prisma.TransactionClient | typeof prisma;

export const orderInclude = {
  contact: { select: { id: true, name: true, phone: true, email: true, company: true } },
  orderDetails: true,
  orderItems: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] },
};

export function findOrderById(context: AuthorizationContext, id: string, reader: OrderReader = prisma) {
  return reader.case.findFirst({
    where: { id, type: CASE_TYPE.ORDER, ...getCaseScopeFilter(context) },
    include: orderInclude,
  });
}

export function findOrderByNumber(context: AuthorizationContext, number: number, reader: OrderReader = prisma) {
  return reader.case.findFirst({
    where: { number, type: CASE_TYPE.ORDER, ...getCaseScopeFilter(context) },
    include: orderInclude,
  });
}

export async function findOrders(context: AuthorizationContext, filters: {
  query?: string;
  status?: string;
  paymentStatus?: string;
  page: number;
  pageSize: number;
}) {
  const query = filters.query?.trim();
  const number = query && /^#?\d+$/.test(query) ? Number(query.replace("#", "")) : null;
  const normalizedPhone = query?.replace(/\D/g, "") ?? "";
  const where: Prisma.CaseWhereInput = {
    type: CASE_TYPE.ORDER,
    ...getCaseScopeFilter(context),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentStatus ? { orderDetails: { is: { paymentStatus: filters.paymentStatus } } } : {}),
    ...(query ? { OR: [
      ...(number && Number.isSafeInteger(number) ? [{ number }] : []),
      { title: { contains: query, mode: "insensitive" } },
      { contact: { is: { name: { contains: query, mode: "insensitive" } } } },
      { contact: { is: { phone: { contains: query, mode: "insensitive" } } } },
      ...(normalizedPhone ? [{ contact: { is: { phoneNormalized: { contains: normalizedPhone } } } }] : []),
      { contact: { is: { email: { contains: query, mode: "insensitive" } } } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.case.findMany({ where, include: orderInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.case.count({ where }),
  ]);
  return { items, total };
}

export function listOrderContacts(context: AuthorizationContext) {
  return prisma.client.findMany({
    where: getClientScopeFilter(context),
    select: { id: true, name: true, phone: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

export function listRecentOrdersForContact(context: AuthorizationContext, contactId: string) {
  return prisma.case.findMany({
    where: { type: CASE_TYPE.ORDER, contactId, ...getCaseScopeFilter(context) },
    select: { id: true, number: true, status: true, updatedAt: true, orderDetails: { select: { total: true, currency: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 5,
  });
}

export function findOrderTimeline(context: AuthorizationContext, caseId: string) {
  return prisma.activity.findMany({
    where: { workspaceId: context.workspaceId, entityType: "CASE", entityId: caseId },
    include: { actorMember: { select: { userId: true, acceptedInvitations: { where: { acceptedAt: { not: null } }, select: { email: true }, orderBy: { acceptedAt: "desc" }, take: 1 } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
