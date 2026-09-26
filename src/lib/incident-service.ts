import "server-only";

import { GroupScopeMode, Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, maskActivityEmail, recordActivity } from "@/lib/activity-service";
import { hasAllGroups, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { changeCaseStatusInTransaction, createCaseInTransaction, updateCaseCoreInTransaction } from "@/lib/case-service";
import {
  CASE_PRIORITY,
  CASE_TYPE,
  INCIDENT_STATUS,
  canTransitionIncidentStatus,
  isCasePriority,
  isIncidentStatus,
} from "@/lib/case-types";
import {
  findIncidentById,
  findIncidentByNumber,
  findIncidentTimeline,
  findIncidents,
  listAvailableTicketsForIncident,
  listIncidentMembers,
  listRelatedIncidentsForTicket,
} from "@/lib/incident-repository";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import { getTicketScopeFilter } from "@/lib/ticket-repository";

const MAX_RESOLUTION_LENGTH = 5_000;
const MAX_NOTE_LENGTH = 5_000;
const DEFAULT_PAGE_SIZE = 30;

export class IncidentValidationError extends Error {}

type IncidentMember = Awaited<ReturnType<typeof listIncidentMembers>>[number];

export function incidentMemberLabel(member: Pick<IncidentMember, "userId" | "acceptedInvitations"> | null | undefined) {
  return member?.acceptedInvitations[0]?.email ?? (member ? `Usuario ${member.userId.slice(0, 8)}…` : "Miembro anterior");
}

function incidentActivityTarget(member: Pick<IncidentMember, "userId" | "acceptedInvitations">) {
  return member.acceptedInvitations[0]?.email ? maskActivityEmail(member.acceptedInvitations[0].email) : `Usuario ${member.userId.slice(0, 8)}…`;
}

function normalizeResolution(value: string | null | undefined) {
  const resolution = value?.trim() ?? "";
  if (resolution.length > MAX_RESOLUTION_LENGTH) throw new IncidentValidationError(`La resolución no puede superar ${MAX_RESOLUTION_LENGTH} caracteres.`);
  return resolution || null;
}

function normalizeNote(value: string) {
  const body = value.trim();
  if (!body) throw new IncidentValidationError("La nota no puede estar vacía.");
  if (body.length > MAX_NOTE_LENGTH) throw new IncidentValidationError(`La nota no puede superar ${MAX_NOTE_LENGTH} caracteres.`);
  return body;
}

function uniqueIds(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function memberCanAccessIncidents(member: IncidentMember) {
  const canView = getEffectivePermissions(member.role, member.permissionOverrides).has(WorkspacePermission.INCIDENT_VIEW);
  return canView && (member.role === WorkspaceRole.OWNER || member.groupScopeMode === GroupScopeMode.ALL);
}

async function eligibleMembers(transaction: Prisma.TransactionClient, context: AuthorizationContext) {
  return (await listIncidentMembers(context, transaction)).filter(memberCanAccessIncidents);
}

async function validateEligibleMemberIds(
  transaction: Prisma.TransactionClient,
  context: AuthorizationContext,
  memberIds: readonly string[],
) {
  const members = await eligibleMembers(transaction, context);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  if (memberIds.some((memberId) => !memberMap.has(memberId))) {
    throw new IncidentValidationError("Uno de los miembros no puede acceder a incidencias en esta cartera.");
  }
  return memberMap;
}

type IncidentRecord = Awaited<ReturnType<typeof findIncidentById>>;
type ValidIncident = NonNullable<IncidentRecord> & { incidentDetails: NonNullable<NonNullable<IncidentRecord>["incidentDetails"]> };

function ensureIncidentShape(incident: IncidentRecord): ValidIncident | null {
  if (!incident || incident.type !== CASE_TYPE.INCIDENT || !incident.incidentDetails || incident.contactId !== null) return null;
  return incident as ValidIncident;
}

function redactTickets(context: AuthorizationContext, incident: ValidIncident) {
  return hasPermission(context, WorkspacePermission.TICKET_VIEW)
    ? incident
    : { ...incident, incidentTicketLinks: [] };
}

export type CreateIncidentInput = {
  title: string;
  description?: string | null;
  priority?: string | null;
  assignedMemberId?: string | null;
  participantIds?: string[];
};

export async function createIncident(context: AuthorizationContext, input: CreateIncidentInput) {
  requirePermission(context, WorkspacePermission.INCIDENT_CREATE);
  if (!hasAllGroups(context)) throw new IncidentValidationError("El alcance actual no permite acceder a incidencias.");
  const assignedMemberId = input.assignedMemberId?.trim() || null;
  const participantIds = uniqueIds(input.participantIds);
  const requestedMemberIds = uniqueIds([...(assignedMemberId ? [assignedMemberId] : []), ...participantIds]);

  return prisma.$transaction(async (transaction) => {
    const created = await createCaseInTransaction(context, {
      type: CASE_TYPE.INCIDENT,
      contactId: null,
      title: input.title,
      description: input.description,
      priority: input.priority === undefined ? CASE_PRIORITY.NORMAL : input.priority,
    }, transaction);
    const candidates = await validateEligibleMemberIds(transaction, context, requestedMemberIds);
    await transaction.incidentDetails.create({ data: { caseId: created.id, assignedMemberId } });
    if (requestedMemberIds.length) {
      await transaction.incidentParticipant.createMany({
        data: requestedMemberIds.map((memberId) => ({
          caseId: created.id,
          memberId,
          memberUserId: candidates.get(memberId)!.userId,
          addedByMemberId: context.memberId,
          addedByUserId: context.userId,
        })),
        skipDuplicates: true,
      });
    }
    if (assignedMemberId) {
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.INCIDENT_ASSIGNED, metadata: { type: CASE_TYPE.INCIDENT, number: created.number, target: incidentActivityTarget(candidates.get(assignedMemberId)!) } }, transaction);
    }
    const additionalParticipants = participantIds.filter((id) => id !== assignedMemberId);
    if (additionalParticipants.length) {
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.INCIDENT_PARTICIPANTS_ADDED, metadata: { type: CASE_TYPE.INCIDENT, number: created.number, count: additionalParticipants.length } }, transaction);
    }
    return findIncidentById(context, created.id, transaction);
  }, { maxWait: 20_000, timeout: 30_000 });
}

export type ListIncidentsInput = { query?: string; status?: string; priority?: string; assignedMemberId?: string; page?: number };

export async function listIncidents(context: AuthorizationContext, input: ListIncidentsInput = {}) {
  requirePermission(context, WorkspacePermission.INCIDENT_VIEW);
  if (!hasAllGroups(context)) return { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, pageCount: 1 };
  if (input.status && !isIncidentStatus(input.status)) throw new IncidentValidationError("El estado no es válido.");
  if (input.priority && !isCasePriority(input.priority)) throw new IncidentValidationError("La prioridad no es válida.");
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page!, 1_000) : 1;
  const result = await findIncidents(context, { ...input, page, pageSize: DEFAULT_PAGE_SIZE });
  return { ...result, page, pageSize: DEFAULT_PAGE_SIZE, pageCount: Math.max(1, Math.ceil(result.total / DEFAULT_PAGE_SIZE)) };
}

export async function getIncident(context: AuthorizationContext, number: number) {
  requirePermission(context, WorkspacePermission.INCIDENT_VIEW);
  if (!hasAllGroups(context) || !Number.isSafeInteger(number) || number < 1) return null;
  const incident = ensureIncidentShape(await findIncidentByNumber(context, number));
  return incident ? redactTickets(context, incident) : null;
}

export async function updateIncident(context: AuthorizationContext, id: string, input: { title: string; description?: string | null; priority?: string | null }) {
  requirePermission(context, WorkspacePermission.INCIDENT_EDIT);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    await updateCaseCoreInTransaction(context, incident.id, input, transaction);
    return findIncidentById(context, incident.id, transaction);
  });
}

export async function assignIncident(context: AuthorizationContext, id: string, memberId: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_ASSIGN);
  const requestedMemberId = memberId.trim();
  if (!requestedMemberId) throw new IncidentValidationError("Seleccioná un responsable.");
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    const members = await validateEligibleMemberIds(transaction, context, [requestedMemberId]);
    const member = members.get(requestedMemberId)!;
    if (incident.incidentDetails.assignedMemberId === requestedMemberId) return incident;
    await transaction.incidentDetails.update({ where: { caseId: incident.id }, data: { assignedMemberId: requestedMemberId } });
    await transaction.incidentParticipant.createMany({ data: [{ caseId: incident.id, memberId: requestedMemberId, memberUserId: member.userId, addedByMemberId: context.memberId, addedByUserId: context.userId }], skipDuplicates: true });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_ASSIGNED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, target: incidentActivityTarget(member) } }, transaction);
    return findIncidentById(context, incident.id, transaction);
  });
}

export async function unassignIncident(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_ASSIGN);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    if (!incident.incidentDetails.assignedMemberId) return incident;
    await transaction.incidentDetails.update({ where: { caseId: incident.id }, data: { assignedMemberId: null } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_UNASSIGNED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number } }, transaction);
    return findIncidentById(context, incident.id, transaction);
  });
}

export async function addIncidentParticipants(context: AuthorizationContext, id: string, memberIds: string[]) {
  requirePermission(context, WorkspacePermission.INCIDENT_ASSIGN);
  const requestedIds = uniqueIds(memberIds);
  if (!requestedIds.length) throw new IncidentValidationError("Seleccioná al menos un participante.");
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    const candidates = await validateEligibleMemberIds(transaction, context, requestedIds);
    const existing = new Set(incident.incidentParticipants.map(({ memberId }) => memberId).filter(Boolean));
    const toCreate = requestedIds.filter((memberId) => !existing.has(memberId));
    const created = toCreate.length ? await transaction.incidentParticipant.createMany({
      data: toCreate.map((memberId) => ({ caseId: incident.id, memberId, memberUserId: candidates.get(memberId)!.userId, addedByMemberId: context.memberId, addedByUserId: context.userId })),
      skipDuplicates: true,
    }) : { count: 0 };
    if (created.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_PARTICIPANTS_ADDED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, count: created.count } }, transaction);
    return { added: created.count, unchanged: requestedIds.length - created.count };
  });
}

export async function removeIncidentParticipant(context: AuthorizationContext, id: string, memberId: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_ASSIGN);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    if (incident.incidentDetails.assignedMemberId === memberId) throw new IncidentValidationError("Quitá o cambiá el responsable antes de removerlo como participante.");
    const deleted = await transaction.incidentParticipant.deleteMany({ where: { caseId: incident.id, memberId } });
    if (deleted.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_PARTICIPANTS_REMOVED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, count: deleted.count } }, transaction);
    return { removed: deleted.count > 0 };
  });
}

export async function updateIncidentResolution(context: AuthorizationContext, id: string, value: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_RESOLVE);
  const resolution = normalizeResolution(value);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    if (incident.incidentDetails.resolution === resolution) return incident;
    await transaction.incidentDetails.update({ where: { caseId: incident.id }, data: { resolution } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_RESOLUTION_UPDATED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number } }, transaction);
    return findIncidentById(context, incident.id, transaction);
  });
}

export async function changeIncidentStatus(context: AuthorizationContext, id: string, nextStatus: string, resolutionInput?: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_RESOLVE);
  if (!isIncidentStatus(nextStatus)) throw new IncidentValidationError("El estado no es válido.");
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    if (!isIncidentStatus(incident.status) || !canTransitionIncidentStatus(incident.status, nextStatus)) throw new IncidentValidationError("Esa transición de estado no está permitida.");
    const resolution = resolutionInput === undefined ? incident.incidentDetails.resolution : normalizeResolution(resolutionInput);
    if (nextStatus === INCIDENT_STATUS.RESOLVED && !resolution) throw new IncidentValidationError("Ingresá una resolución antes de marcar la incidencia como resuelta.");
    if (resolutionInput !== undefined && resolution !== incident.incidentDetails.resolution) {
      await transaction.incidentDetails.update({ where: { caseId: incident.id }, data: { resolution } });
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_RESOLUTION_UPDATED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number } }, transaction);
    }
    await changeCaseStatusInTransaction(context, incident.id, nextStatus, transaction);
    return findIncidentById(context, incident.id, transaction);
  });
}

export async function addIncidentNote(context: AuthorizationContext, id: string, value: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_EDIT);
  const body = normalizeNote(value);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, id, transaction));
    if (!incident) return null;
    const note = await transaction.incidentNote.create({ data: { caseId: incident.id, authorMemberId: context.memberId, authorUserId: context.userId, body } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_NOTE_ADDED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, noteId: note.id } }, transaction);
    return note;
  });
}

export async function linkTickets(context: AuthorizationContext, incidentId: string, ticketIds: string[]) {
  requirePermission(context, WorkspacePermission.INCIDENT_EDIT);
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  const requestedIds = uniqueIds(ticketIds);
  if (!requestedIds.length) throw new IncidentValidationError("Seleccioná al menos un ticket.");
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, incidentId, transaction));
    if (!incident) return null;
    const tickets = await transaction.case.findMany({ where: { id: { in: requestedIds }, ...getTicketScopeFilter(context) }, select: { id: true } });
    if (tickets.length !== requestedIds.length) throw new IncidentValidationError("Uno de los tickets no existe o está fuera de tu alcance.");
    const created = await transaction.incidentTicket.createMany({
      data: requestedIds.map((ticketCaseId) => ({ incidentCaseId: incident.id, ticketCaseId, linkedByMemberId: context.memberId, linkedByUserId: context.userId })),
      skipDuplicates: true,
    });
    if (created.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_TICKETS_LINKED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, count: created.count } }, transaction);
    return { linked: created.count, unchanged: requestedIds.length - created.count };
  }, { maxWait: 20_000, timeout: 30_000 });
}

export async function unlinkTicket(context: AuthorizationContext, incidentId: string, ticketId: string) {
  requirePermission(context, WorkspacePermission.INCIDENT_EDIT);
  return prisma.$transaction(async (transaction) => {
    const incident = ensureIncidentShape(await findIncidentById(context, incidentId, transaction));
    if (!incident) return null;
    const deleted = await transaction.incidentTicket.deleteMany({ where: { incidentCaseId: incident.id, ticketCaseId: ticketId } });
    if (deleted.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: incident.id, action: ACTIVITY_ACTION.INCIDENT_TICKETS_UNLINKED, metadata: { type: CASE_TYPE.INCIDENT, number: incident.number, count: deleted.count } }, transaction);
    return { unlinked: deleted.count > 0 };
  });
}

export async function getIncidentTimeline(context: AuthorizationContext, number: number) {
  requirePermission(context, WorkspacePermission.INCIDENT_VIEW);
  const incident = await getIncident(context, number);
  return incident ? findIncidentTimeline(context, incident.id) : null;
}

export async function getIncidentFormOptions(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.INCIDENT_CREATE);
  if (!hasAllGroups(context)) return { members: [] };
  return prisma.$transaction(async (transaction) => ({ members: (await eligibleMembers(transaction, context)).map((member) => ({ id: member.id, label: incidentMemberLabel(member) })) }));
}

export async function getEligibleIncidentMembers(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.INCIDENT_VIEW);
  if (!hasAllGroups(context)) return [];
  return prisma.$transaction(async (transaction) => (await eligibleMembers(transaction, context)).map((member) => ({ id: member.id, label: incidentMemberLabel(member) })));
}

export async function getAvailableIncidentTickets(context: AuthorizationContext, incidentId: string, query = "") {
  requirePermission(context, WorkspacePermission.INCIDENT_EDIT);
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  const incident = ensureIncidentShape(await findIncidentById(context, incidentId));
  return incident ? listAvailableTicketsForIncident(context, incident.id, query) : [];
}

export async function getRelatedIncidentsForTicket(context: AuthorizationContext, ticketCaseId: string) {
  if (!hasAllGroups(context) || !hasPermission(context, WorkspacePermission.INCIDENT_VIEW)) return [];
  return (await listRelatedIncidentsForTicket(context, ticketCaseId)).map(({ incidentCase }) => incidentCase);
}
