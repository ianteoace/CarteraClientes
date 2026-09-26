import "server-only";

import { Prisma } from "@prisma/client";

import { getClientScopeFilter, hasAllGroups, type AuthorizationContext } from "@/lib/authorization";
import type { CasePriority, CaseType } from "@/lib/case-types";
import { prisma } from "@/lib/prisma";

type CaseWriter = Prisma.TransactionClient;

export type CaseCreateData = {
  workspaceId: string;
  contactId: string | null;
  type: CaseType;
  title: string;
  description: string | null;
  status: string;
  priority: CasePriority | null;
  createdByMemberId: string;
  createdByUserId: string;
};

export type CaseListFilters = {
  type?: CaseType;
  status?: string;
  contactId?: string;
  page: number;
  pageSize: number;
};

export function getCaseScopeFilter(context: AuthorizationContext): Prisma.CaseWhereInput {
  return {
    workspaceId: context.workspaceId,
    ...(!hasAllGroups(context) ? {
      contactId: { not: null },
      contact: { is: getClientScopeFilter(context) },
    } : {}),
  };
}

export async function allocateCaseNumber(transaction: CaseWriter, workspaceId: string) {
  const rows = await transaction.$queryRaw<Array<{ number: number }>>(Prisma.sql`
    INSERT INTO "WorkspaceSequence" ("workspaceId", "caseNextNumber")
    VALUES (${workspaceId}, 2)
    ON CONFLICT ("workspaceId")
    DO UPDATE SET "caseNextNumber" = "WorkspaceSequence"."caseNextNumber" + 1
    RETURNING "caseNextNumber" - 1 AS "number"
  `);
  const number = rows[0]?.number;
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("No se pudo asignar el número del caso.");
  return number;
}

export async function createCaseRecord(transaction: CaseWriter, data: CaseCreateData) {
  const number = await allocateCaseNumber(transaction, data.workspaceId);
  return transaction.case.create({ data: { ...data, number } });
}

export function findCaseById(context: AuthorizationContext, id: string, transaction: CaseWriter | typeof prisma = prisma) {
  return transaction.case.findFirst({ where: { id, ...getCaseScopeFilter(context) } });
}

export function findCaseByNumber(context: AuthorizationContext, number: number, transaction: CaseWriter | typeof prisma = prisma) {
  return transaction.case.findFirst({ where: { number, ...getCaseScopeFilter(context) } });
}

export async function findCases(context: AuthorizationContext, filters: CaseListFilters) {
  const where: Prisma.CaseWhereInput = {
    ...getCaseScopeFilter(context),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.case.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
    prisma.case.count({ where }),
  ]);
  return { items, total };
}
