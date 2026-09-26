import "server-only";

import { GroupScopeMode, Prisma, WorkspacePermission, WorkspaceRole } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, maskActivityEmail, recordActivity } from "@/lib/activity-service";
import { getClientScopeFilter, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import {
  changeCaseStatusInTransaction,
  createCaseInTransaction,
  updateCaseCoreInTransaction,
} from "@/lib/case-service";
import {
  CASE_PRIORITY,
  CASE_TYPE,
  TICKET_SOURCE,
  TICKET_STATUS,
  canTransitionTicketStatus,
  isCasePriority,
  isTicketStatus,
} from "@/lib/case-types";
import { getEffectivePermissions } from "@/lib/permission-presets";
import { prisma } from "@/lib/prisma";
import {
  findTicketById,
  findTicketByNumber,
  findTicketTimeline,
  findTickets,
  listRecentTicketsForContact,
  listTicketContacts,
  listTicketMembers,
} from "@/lib/ticket-repository";

const MAX_RESOLUTION_LENGTH = 5_000;
const MAX_NOTE_LENGTH = 5_000;
const DEFAULT_PAGE_SIZE = 30;

export class TicketValidationError extends Error {}

type TicketMember = Awaited<ReturnType<typeof listTicketMembers>>[number];

export function ticketMemberLabel(member: Pick<TicketMember, "userId" | "acceptedInvitations"> | null | undefined) {
  return member?.acceptedInvitations[0]?.email ?? (member ? `Usuario ${member.userId.slice(0, 8)}…` : "Miembro anterior");
}

function ticketActivityTarget(member: Pick<TicketMember, "userId" | "acceptedInvitations">) {
  return member.acceptedInvitations[0]?.email ? maskActivityEmail(member.acceptedInvitations[0].email) : `Usuario ${member.userId.slice(0, 8)}…`;
}

function normalizeResolution(value: string | null | undefined) {
  const resolution = value?.trim() ?? "";
  if (resolution.length > MAX_RESOLUTION_LENGTH) {
    throw new TicketValidationError(`La resolución no puede superar ${MAX_RESOLUTION_LENGTH} caracteres.`);
  }
  return resolution || null;
}

function normalizeNote(value: string) {
  const body = value.trim();
  if (!body) throw new TicketValidationError("La nota no puede estar vacía.");
  if (body.length > MAX_NOTE_LENGTH) throw new TicketValidationError(`La nota no puede superar ${MAX_NOTE_LENGTH} caracteres.`);
  return body;
}

function uniqueIds(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function memberCanViewTickets(member: TicketMember) {
  return getEffectivePermissions(member.role, member.permissionOverrides).has(WorkspacePermission.TICKET_VIEW);
}

function memberCanAccessContact(member: TicketMember, contactGroupIds: readonly string[]) {
  if (member.role === WorkspaceRole.OWNER || member.groupScopeMode === GroupScopeMode.ALL) return true;
  const allowedGroups = new Set(member.groupAccess.map(({ groupId }) => groupId));
  return contactGroupIds.some((groupId) => allowedGroups.has(groupId));
}

async function contactGroupIds(transaction: Prisma.TransactionClient, workspaceId: string, contactId: string) {
  const contact = await transaction.client.findFirst({
    where: { id: contactId, workspaceId },
    select: { clientGroups: { select: { groupId: true } } },
  });
  if (!contact) throw new TicketValidationError("El contacto ya no existe en esta cartera.");
  return contact.clientGroups.map(({ groupId }) => groupId);
}

async function eligibleMembers(
  transaction: Prisma.TransactionClient,
  context: AuthorizationContext,
  contactId: string,
) {
  const [members, groupIds] = await Promise.all([
    listTicketMembers(context, transaction),
    contactGroupIds(transaction, context.workspaceId, contactId),
  ]);
  return members.filter((member) => memberCanViewTickets(member) && memberCanAccessContact(member, groupIds));
}

async function validateEligibleMemberIds(
  transaction: Prisma.TransactionClient,
  context: AuthorizationContext,
  contactId: string,
  memberIds: readonly string[],
) {
  const members = await eligibleMembers(transaction, context, contactId);
  const memberMap = new Map(members.map((member) => [member.id, member]));
  if (memberIds.some((memberId) => !memberMap.has(memberId))) {
    throw new TicketValidationError("Uno de los miembros no puede acceder al contacto de este ticket.");
  }
  return memberMap;
}

type TicketRecord = Awaited<ReturnType<typeof findTicketById>>;
type ValidTicket = NonNullable<TicketRecord> & {
  contactId: string;
  ticketDetails: NonNullable<NonNullable<TicketRecord>["ticketDetails"]>;
};

function ensureTicketShape(ticket: TicketRecord): ValidTicket | null {
  if (!ticket || ticket.type !== CASE_TYPE.TICKET || !ticket.ticketDetails || !ticket.contactId) return null;
  return ticket as ValidTicket;
}

export type CreateTicketInput = {
  contactId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  assignedMemberId?: string | null;
  participantIds?: string[];
};

export async function createTicket(context: AuthorizationContext, input: CreateTicketInput) {
  requirePermission(context, WorkspacePermission.TICKET_CREATE);
  const contactId = input.contactId.trim();
  if (!contactId) throw new TicketValidationError("Seleccioná un contacto.");
  const assignedMemberId = input.assignedMemberId?.trim() || null;
  const participantIds = uniqueIds(input.participantIds);
  const requestedMemberIds = uniqueIds([...(assignedMemberId ? [assignedMemberId] : []), ...participantIds]);

  return prisma.$transaction(async (transaction) => {
    const created = await createCaseInTransaction(context, {
      type: CASE_TYPE.TICKET,
      contactId,
      title: input.title,
      description: input.description,
      priority: input.priority === undefined ? CASE_PRIORITY.NORMAL : input.priority,
    }, transaction);
    const candidates = await validateEligibleMemberIds(transaction, context, contactId, requestedMemberIds);
    await transaction.ticketDetails.create({
      data: { caseId: created.id, assignedMemberId, source: TICKET_SOURCE.MANUAL },
    });
    if (requestedMemberIds.length) {
      await transaction.ticketParticipant.createMany({
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
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.TICKET_ASSIGNED, metadata: { type: CASE_TYPE.TICKET, number: created.number, target: ticketActivityTarget(candidates.get(assignedMemberId)!) } }, transaction);
    }
    const additionalParticipants = participantIds.filter((id) => id !== assignedMemberId);
    if (additionalParticipants.length) {
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: created.id, action: ACTIVITY_ACTION.TICKET_PARTICIPANTS_ADDED, metadata: { type: CASE_TYPE.TICKET, number: created.number, count: additionalParticipants.length } }, transaction);
    }
    return findTicketById(context, created.id, transaction);
  }, { maxWait: 20_000, timeout: 30_000 });
}

export type ListTicketsInput = {
  query?: string;
  status?: string;
  priority?: string;
  assignedMemberId?: string;
  contactId?: string;
  page?: number;
};

export async function listTickets(context: AuthorizationContext, input: ListTicketsInput = {}) {
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  if (input.status && !isTicketStatus(input.status)) throw new TicketValidationError("El estado no es válido.");
  if (input.priority && !isCasePriority(input.priority)) throw new TicketValidationError("La prioridad no es válida.");
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? Math.min(input.page!, 1_000) : 1;
  const result = await findTickets(context, { ...input, page, pageSize: DEFAULT_PAGE_SIZE });
  return { ...result, page, pageSize: DEFAULT_PAGE_SIZE, pageCount: Math.max(1, Math.ceil(result.total / DEFAULT_PAGE_SIZE)) };
}

export async function getTicket(context: AuthorizationContext, number: number) {
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return ensureTicketShape(await findTicketByNumber(context, number));
}

export async function updateTicket(context: AuthorizationContext, id: string, input: { title: string; description?: string | null; priority?: string | null }) {
  requirePermission(context, WorkspacePermission.TICKET_EDIT);
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    await updateCaseCoreInTransaction(context, ticket.id, input, transaction);
    return findTicketById(context, ticket.id, transaction);
  });
}

export async function assignTicket(context: AuthorizationContext, id: string, memberId: string) {
  requirePermission(context, WorkspacePermission.TICKET_ASSIGN);
  const requestedMemberId = memberId.trim();
  if (!requestedMemberId) throw new TicketValidationError("Seleccioná un responsable.");
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    const members = await validateEligibleMemberIds(transaction, context, ticket.contactId, [requestedMemberId]);
    const member = members.get(requestedMemberId)!;
    if (ticket.ticketDetails.assignedMemberId === requestedMemberId) return ticket;
    await transaction.ticketDetails.update({ where: { caseId: ticket.id }, data: { assignedMemberId: requestedMemberId } });
    await transaction.ticketParticipant.createMany({
      data: [{ caseId: ticket.id, memberId: requestedMemberId, memberUserId: member.userId, addedByMemberId: context.memberId, addedByUserId: context.userId }],
      skipDuplicates: true,
    });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_ASSIGNED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number, target: ticketActivityTarget(member) } }, transaction);
    return findTicketById(context, ticket.id, transaction);
  });
}

export async function unassignTicket(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.TICKET_ASSIGN);
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    if (!ticket.ticketDetails.assignedMemberId) return ticket;
    await transaction.ticketDetails.update({ where: { caseId: ticket.id }, data: { assignedMemberId: null } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_UNASSIGNED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number } }, transaction);
    return findTicketById(context, ticket.id, transaction);
  });
}

export async function addTicketParticipants(context: AuthorizationContext, id: string, memberIds: string[]) {
  requirePermission(context, WorkspacePermission.TICKET_ASSIGN);
  const requestedIds = uniqueIds(memberIds);
  if (!requestedIds.length) throw new TicketValidationError("Seleccioná al menos un participante.");
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    const candidates = await validateEligibleMemberIds(transaction, context, ticket.contactId, requestedIds);
    const existing = new Set(ticket.ticketParticipants.map(({ memberId }) => memberId).filter(Boolean));
    const toCreate = requestedIds.filter((memberId) => !existing.has(memberId));
    if (toCreate.length) {
      await transaction.ticketParticipant.createMany({
        data: toCreate.map((memberId) => ({ caseId: ticket.id, memberId, memberUserId: candidates.get(memberId)!.userId, addedByMemberId: context.memberId, addedByUserId: context.userId })),
        skipDuplicates: true,
      });
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_PARTICIPANTS_ADDED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number, count: toCreate.length } }, transaction);
    }
    return { added: toCreate.length, unchanged: requestedIds.length - toCreate.length };
  });
}

export async function removeTicketParticipant(context: AuthorizationContext, id: string, memberId: string) {
  requirePermission(context, WorkspacePermission.TICKET_ASSIGN);
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    if (ticket.ticketDetails.assignedMemberId === memberId) throw new TicketValidationError("Quitá o cambiá el responsable antes de removerlo como participante.");
    const participant = ticket.ticketParticipants.find((item) => item.memberId === memberId);
    if (!participant) return { removed: false };
    await transaction.ticketParticipant.delete({ where: { id: participant.id } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_PARTICIPANTS_REMOVED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number, count: 1 } }, transaction);
    return { removed: true };
  });
}

export async function updateTicketResolution(context: AuthorizationContext, id: string, value: string) {
  requirePermission(context, WorkspacePermission.TICKET_RESOLVE);
  const resolution = normalizeResolution(value);
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    if (ticket.ticketDetails.resolution === resolution) return ticket;
    await transaction.ticketDetails.update({ where: { caseId: ticket.id }, data: { resolution } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_RESOLUTION_UPDATED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number } }, transaction);
    return findTicketById(context, ticket.id, transaction);
  });
}

export async function changeTicketStatus(context: AuthorizationContext, id: string, nextStatus: string, resolutionInput?: string) {
  requirePermission(context, WorkspacePermission.TICKET_RESOLVE);
  if (!isTicketStatus(nextStatus)) throw new TicketValidationError("El estado no es válido.");
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    if (!isTicketStatus(ticket.status) || !canTransitionTicketStatus(ticket.status, nextStatus)) {
      throw new TicketValidationError("Esa transición de estado no está permitida.");
    }
    const resolution = resolutionInput === undefined ? ticket.ticketDetails.resolution : normalizeResolution(resolutionInput);
    if (nextStatus === TICKET_STATUS.RESOLVED && !resolution) {
      throw new TicketValidationError("Ingresá una resolución antes de marcar el ticket como resuelto.");
    }
    if (resolutionInput !== undefined && resolution !== ticket.ticketDetails.resolution) {
      await transaction.ticketDetails.update({ where: { caseId: ticket.id }, data: { resolution } });
      await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_RESOLUTION_UPDATED, metadata: { type: CASE_TYPE.TICKET, number: ticket.number } }, transaction);
    }
    await changeCaseStatusInTransaction(context, ticket.id, nextStatus, transaction);
    return findTicketById(context, ticket.id, transaction);
  });
}

export async function addTicketNote(context: AuthorizationContext, id: string, value: string) {
  requirePermission(context, WorkspacePermission.TICKET_EDIT);
  const body = normalizeNote(value);
  return prisma.$transaction(async (transaction) => {
    const ticket = ensureTicketShape(await findTicketById(context, id, transaction));
    if (!ticket) return null;
    const note = await transaction.ticketNote.create({ data: { caseId: ticket.id, authorMemberId: context.memberId, authorUserId: context.userId, body } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CASE, entityId: ticket.id, action: ACTIVITY_ACTION.TICKET_NOTE_ADDED, metadata: { type: CASE_TYPE.TICKET, noteId: note.id, number: ticket.number } }, transaction);
    return note;
  });
}

export async function getTicketTimeline(context: AuthorizationContext, number: number) {
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  const ticket = await getTicket(context, number);
  return ticket ? findTicketTimeline(context, ticket.id) : null;
}

export async function getTicketFormOptions(context: AuthorizationContext) {
  requirePermission(context, WorkspacePermission.TICKET_CREATE);
  const [contacts, members] = await Promise.all([listTicketContacts(context), listTicketMembers(context)]);
  const visibleMembers = members.filter(memberCanViewTickets).map((member) => ({
    id: member.id,
    label: ticketMemberLabel(member),
    eligibleContactIds: contacts.filter((contact) => memberCanAccessContact(member, contact.clientGroups.map(({ groupId }) => groupId))).map(({ id }) => id),
  }));
  return {
    contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email })),
    members: visibleMembers,
  };
}

export async function getEligibleTicketMembers(context: AuthorizationContext, contactId: string) {
  requirePermission(context, WorkspacePermission.TICKET_VIEW);
  const visibleContact = await prisma.client.findFirst({ where: { id: contactId, ...getClientScopeFilter(context) }, select: { id: true } });
  if (!visibleContact) return [];
  return prisma.$transaction(async (transaction) => (await eligibleMembers(transaction, context, contactId)).map((member) => ({ id: member.id, label: ticketMemberLabel(member) })));
}

export async function getRecentTicketsForContact(context: AuthorizationContext, contactId: string) {
  if (!hasPermission(context, WorkspacePermission.TICKET_VIEW)) return [];
  return listRecentTicketsForContact(context, contactId);
}
