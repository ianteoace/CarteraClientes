import "server-only";

import type { Prisma } from "@prisma/client";

import { getClientScopeFilter, hasAllGroups, type AuthorizationContext } from "@/lib/authorization";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { createCaseRecord, findCaseById, findCaseByNumber, findCases } from "@/lib/case-repository";
import {
  CASE_PRIORITY, type CasePriority, type CaseType, getInitialCaseStatus, isCasePriority,
  isCaseStatusForType, isCaseType, isClosedCaseStatus, isKnownCaseStatus,
} from "@/lib/case-types";
import { prisma } from "@/lib/prisma";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10_000;
const DEFAULT_PAGE_SIZE = 50;

export class CaseValidationError extends Error {}

export type CreateCaseInput = {
  type: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string | null;
  contactId?: string | null;
};

export type UpdateCaseCoreInput = {
  title?: string;
  description?: string | null;
  priority?: string | null;
  contactId?: string | null;
};

export type ListCasesInput = {
  type?: string;
  status?: string;
  contactId?: string;
  page?: number;
  pageSize?: number;
};

function normalizedTitle(value: string) {
  const title = value.trim();
  if (!title) throw new CaseValidationError("El título del caso es obligatorio.");
  if (title.length > MAX_TITLE_LENGTH) throw new CaseValidationError(`El título no puede superar ${MAX_TITLE_LENGTH} caracteres.`);
  return title;
}

function normalizedDescription(value?: string | null) {
  const description = value?.trim() ?? "";
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new CaseValidationError(`La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`);
  return description || null;
}

function validatedType(value: unknown): CaseType {
  if (!isCaseType(value)) throw new CaseValidationError("El tipo de caso no es válido.");
  if (!getInitialCaseStatus(value)) throw new CaseValidationError("Este tipo de caso todavía no está habilitado.");
  return value;
}

function validatedStatus(type: CaseType, value: unknown) {
  if (!isCaseStatusForType(type, value)) throw new CaseValidationError("El estado no es válido para este tipo de caso.");
  return value as string;
}

function validatedPriority(value: unknown): CasePriority | null {
  if (value === null) return null;
  if (!isCasePriority(value)) throw new CaseValidationError("La prioridad del caso no es válida.");
  return value;
}

async function validateActor(transaction: Prisma.TransactionClient, context: AuthorizationContext) {
  const actor = await transaction.workspaceMember.findFirst({
    where: { id: context.memberId, workspaceId: context.workspaceId, userId: context.userId },
    select: { id: true },
  });
  if (!actor) throw new CaseValidationError("Ya no pertenecés a esta cartera.");
}

async function validateContact(transaction: Prisma.TransactionClient, context: AuthorizationContext, contactId: string | null) {
  if (!contactId) {
    if (!hasAllGroups(context)) throw new CaseValidationError("Los casos sin contacto requieren acceso a todos los grupos.");
    return null;
  }
  const contact = await transaction.client.findFirst({ where: { id: contactId, ...getClientScopeFilter(context) }, select: { id: true } });
  if (!contact) throw new CaseValidationError("El contacto no pertenece a esta cartera o está fuera de tu alcance.");
  return contact.id;
}

export async function createCaseInTransaction(
  context: AuthorizationContext,
  input: CreateCaseInput,
  transaction: Prisma.TransactionClient,
) {
  const type = validatedType(input.type);
  const initialStatus = getInitialCaseStatus(type)!;
  const status = validatedStatus(type, input.status ?? initialStatus);
  const priority = input.priority === undefined ? CASE_PRIORITY.NORMAL : validatedPriority(input.priority);
  const title = normalizedTitle(input.title);
  const description = normalizedDescription(input.description);
  const requestedContactId = input.contactId?.trim() || null;
  if (type === "INCIDENT" && requestedContactId) throw new CaseValidationError("Las incidencias no admiten un contacto individual.");

  await validateActor(transaction, context);
  const contactId = await validateContact(transaction, context, requestedContactId);
  const created = await createCaseRecord(transaction, {
    workspaceId: context.workspaceId, contactId, type, title, description, status, priority,
    createdByMemberId: context.memberId, createdByUserId: context.userId,
  });
  await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.CASE_CREATED, metadata: { type, number: created.number, title: created.title } }, transaction);
  return created;
}

export function createCase(context: AuthorizationContext, input: CreateCaseInput) {
  return prisma.$transaction((transaction) => createCaseInTransaction(context, input, transaction));
}

export function getCaseById(context: AuthorizationContext, id: string) {
  return findCaseById(context, id);
}

export function getCaseByNumber(context: AuthorizationContext, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return findCaseByNumber(context, number);
}

export async function listCases(context: AuthorizationContext, input: ListCasesInput = {}) {
  const type = input.type === undefined ? undefined : validatedType(input.type);
  if (input.status !== undefined) {
    if (type) validatedStatus(type, input.status);
    else if (!isKnownCaseStatus(input.status)) throw new CaseValidationError("El estado de caso no es válido.");
  }
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page!, 1000) : 1;
  const pageSize = Number.isSafeInteger(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.min(input.pageSize!, 100) : DEFAULT_PAGE_SIZE;
  const contactId = input.contactId?.trim() || undefined;
  const result = await findCases(context, { type, status: input.status, contactId, page, pageSize });
  return { ...result, page, pageSize, pageCount: Math.max(1, Math.ceil(result.total / pageSize)) };
}

export async function updateCaseCoreInTransaction(
  context: AuthorizationContext,
  id: string,
  input: UpdateCaseCoreInput,
  transaction: Prisma.TransactionClient,
) {
  if (Object.prototype.hasOwnProperty.call(input, "type")) throw new CaseValidationError("El tipo de un caso no puede modificarse.");
  const current = await findCaseById(context, id, transaction);
  if (!current) return null;
  const data: Prisma.CaseUpdateInput = {};
  const changedFields: string[] = [];
  if (input.title !== undefined) { data.title = normalizedTitle(input.title); if (data.title !== current.title) changedFields.push("title"); }
  if (input.description !== undefined) { data.description = normalizedDescription(input.description); if (data.description !== current.description) changedFields.push("description"); }
  if (input.priority !== undefined) { data.priority = validatedPriority(input.priority); if (data.priority !== current.priority) changedFields.push("priority"); }
  if (input.contactId !== undefined) {
    const contactId = await validateContact(transaction, context, input.contactId?.trim() || null);
    if (current.type === "INCIDENT" && contactId) throw new CaseValidationError("Las incidencias no admiten un contacto individual.");
    data.contact = contactId ? { connect: { id: contactId } } : { disconnect: true };
    if (contactId !== current.contactId) changedFields.push("contactId");
  }
  if (!changedFields.length) return current;
  const updated = await transaction.case.update({ where: { id: current.id }, data });
  await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: updated.id, action: ACTIVITY_ACTION.CASE_UPDATED, metadata: { type: updated.type, number: updated.number, title: updated.title, changedFields } }, transaction);
  return updated;
}

export function updateCaseCore(context: AuthorizationContext, id: string, input: UpdateCaseCoreInput) {
  return prisma.$transaction((transaction) => updateCaseCoreInTransaction(context, id, input, transaction));
}

export async function changeCaseStatusInTransaction(
  context: AuthorizationContext,
  id: string,
  nextStatus: string,
  transaction: Prisma.TransactionClient,
) {
  const current = await findCaseById(context, id, transaction);
  if (!current) return null;
  if (!isCaseType(current.type)) throw new CaseValidationError("El caso tiene un tipo no soportado.");
  const status = validatedStatus(current.type, nextStatus);
  if (status === current.status) return current;
  const wasClosed = isClosedCaseStatus(current.type, current.status);
  const willBeClosed = isClosedCaseStatus(current.type, status);
  const closedAt = willBeClosed ? (wasClosed ? current.closedAt ?? new Date() : new Date()) : null;
  const updated = await transaction.case.update({ where: { id: current.id }, data: { status, closedAt } });
  const action = !wasClosed && willBeClosed
    ? ACTIVITY_ACTION.CASE_CLOSED
    : wasClosed && !willBeClosed
      ? ACTIVITY_ACTION.CASE_REOPENED
      : ACTIVITY_ACTION.CASE_STATUS_CHANGED;
  await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: updated.id, action, metadata: { type: updated.type, number: updated.number, from: current.status, to: status } }, transaction);
  return updated;
}

export function changeCaseStatus(context: AuthorizationContext, id: string, nextStatus: string) {
  return prisma.$transaction((transaction) => changeCaseStatusInTransaction(context, id, nextStatus, transaction));
}
