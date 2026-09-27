import "server-only";

import { Prisma, WorkspacePermission } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { getClientScopeFilter, hasPermission, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { getCaseScopeFilter } from "@/lib/case-repository";
import { CASE_TYPE } from "@/lib/case-types";
import { getConversationScopeFilter, requireInboxAccess } from "@/lib/conversation-repository";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { attachmentPreviewSelect } from "@/lib/whatsapp/attachment-types";

export class CaseConversationValidationError extends Error {}

export type CaseConversationOrigin = { conversationId: string; sourceMessageIds?: string[]; sourceMessageId?: string | null };
export type ConversationCaseKind = typeof CASE_TYPE.TICKET | typeof CASE_TYPE.ORDER;

function getSourceMessageIds(origin: CaseConversationOrigin) {
  const raw = origin.sourceMessageIds ?? (origin.sourceMessageId ? [origin.sourceMessageId] : []);
  if (raw.length > 50 || raw.some((id) => typeof id !== "string" || !id.trim())) {
    throw new CaseConversationValidationError("Seleccioná hasta 50 mensajes válidos.");
  }
  return [...new Set(raw.map((id) => id.trim()))];
}

function caseAccess(kind: ConversationCaseKind) {
  return kind === CASE_TYPE.TICKET
    ? { module: WORKSPACE_MODULE.TICKETS, create: WorkspacePermission.TICKET_CREATE, view: WorkspacePermission.TICKET_VIEW }
    : { module: WORKSPACE_MODULE.ORDERS, create: WorkspacePermission.ORDER_CREATE, view: WorkspacePermission.ORDER_VIEW };
}

export async function getConversationCaseCreationContext(
  context: AuthorizationContext,
  kind: ConversationCaseKind,
  origin: CaseConversationOrigin,
) {
  await requireInboxAccess(context);
  const access = caseAccess(kind);
  await requireModule(context, access.module);
  requirePermission(context, access.create);
  const conversation = await prisma.conversation.findFirst({
    where: { id: origin.conversationId, ...getConversationScopeFilter(context) },
    select: { id: true, clientId: true, client: { select: { id: true, name: true } } },
  });
  if (!conversation) return null;
  if (!conversation.clientId || !conversation.client) return { conversation, sourceMessages: [], contactMissing: true as const };
  const contact = await prisma.client.findFirst({
    where: { id: conversation.clientId, ...getClientScopeFilter(context) }, select: { id: true },
  });
  if (!contact) return null;
  const sourceMessageIds = getSourceMessageIds(origin);
  const sourceMessages = sourceMessageIds.length ? await prisma.whatsAppMessage.findMany({
    where: { id: { in: sourceMessageIds }, conversationId: conversation.id, workspaceId: context.workspaceId, direction: "INBOUND", type: { in: ["TEXT", "IMAGE"] } },
    select: { id: true, type: true, textBody: true, createdAt: true, attachments: { select: { caption: true }, take: 1 } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  }) : [];
  if (sourceMessages.length !== sourceMessageIds.length) throw new CaseConversationValidationError("Uno o más mensajes de origen no pertenecen a esta conversación.");
  return { conversation, sourceMessages, contactMissing: false as const };
}

export async function linkCaseToConversation(
  context: AuthorizationContext,
  caseRecord: { id: string; workspaceId: string; contactId: string | null; type: string; number: number },
  origin: CaseConversationOrigin,
  transaction: Prisma.TransactionClient,
) {
  if (caseRecord.workspaceId !== context.workspaceId || !caseRecord.contactId || ![CASE_TYPE.TICKET, CASE_TYPE.ORDER].includes(caseRecord.type as ConversationCaseKind)) {
    throw new CaseConversationValidationError("La operación no pertenece a esta cartera.");
  }
  const kind = caseRecord.type as ConversationCaseKind;
  const access = caseAccess(kind);
  requirePermission(context, WorkspacePermission.INBOX_VIEW);
  requirePermission(context, access.create);
  const enabled = await transaction.workspaceModule.count({
    where: { workspaceId: context.workspaceId, key: { in: [WORKSPACE_MODULE.INBOX, access.module] }, enabled: true },
  });
  if (enabled !== 2) throw new CaseConversationValidationError("La Bandeja o el módulo de la operación ya no está disponible.");
  const conversation = await transaction.conversation.findFirst({
    where: { id: origin.conversationId.trim(), ...getConversationScopeFilter(context) },
    select: { id: true, clientId: true },
  });
  if (!conversation || conversation.clientId !== caseRecord.contactId) {
    throw new CaseConversationValidationError("La conversación o su contacto cambió. Volvé a abrir el formulario.");
  }
  const contact = await transaction.client.count({ where: { id: caseRecord.contactId, ...getClientScopeFilter(context) } });
  if (contact !== 1) throw new CaseConversationValidationError("Ya no tenés acceso al contacto de esta conversación.");
  const sourceMessageIds = getSourceMessageIds(origin);
  if (sourceMessageIds.length) {
    const source = await transaction.whatsAppMessage.count({
      where: { id: { in: sourceMessageIds }, workspaceId: context.workspaceId, conversationId: conversation.id, direction: "INBOUND", type: { in: ["TEXT", "IMAGE"] } },
    });
    if (source !== sourceMessageIds.length) throw new CaseConversationValidationError("Uno o más mensajes de origen no pertenecen a esta conversación.");
  }
  const link = await transaction.caseConversation.create({ data: {
    workspaceId: context.workspaceId,
    caseId: caseRecord.id,
    conversationId: conversation.id,
    createdByMemberId: context.memberId,
    createdByUserId: context.userId,
  } });
  if (sourceMessageIds.length) await transaction.caseConversationSourceMessage.createMany({
    data: sourceMessageIds.map((messageId) => ({ workspaceId: context.workspaceId, caseConversationId: link.id, messageId })),
  });
  await recordActivity({
    ...activityActor(context), entityType: ACTIVITY_ENTITY.CONVERSATION, entityId: conversation.id,
    action: ACTIVITY_ACTION.CONVERSATION_CASE_LINKED,
    metadata: { caseType: kind, caseNumber: caseRecord.number, sourceMessageCount: sourceMessageIds.length },
  }, transaction);
  return link;
}

export async function listConversationCases(context: AuthorizationContext, conversationId: string) {
  await requireInboxAccess(context);
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, ...getConversationScopeFilter(context) }, select: { id: true },
  });
  if (!conversation) return [];
  const visibleTypes: ConversationCaseKind[] = [];
  for (const kind of [CASE_TYPE.TICKET, CASE_TYPE.ORDER] as const) {
    const access = caseAccess(kind);
    if (hasPermission(context, access.view)) {
      const moduleEnabled = await prisma.workspaceModule.count({ where: { workspaceId: context.workspaceId, key: access.module, enabled: true } });
      if (moduleEnabled) visibleTypes.push(kind);
    }
  }
  if (!visibleTypes.length) return [];
  return prisma.caseConversation.findMany({
    where: { workspaceId: context.workspaceId, conversationId, case: { is: { ...getCaseScopeFilter(context), type: { in: visibleTypes } } } },
    select: { id: true, createdAt: true, case: { select: { id: true, type: true, number: true, title: true, status: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function listCaseConversations(context: AuthorizationContext, caseId: string) {
  await requireInboxAccess(context);
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, ...getCaseScopeFilter(context) }, select: { type: true },
  });
  if (!caseRecord || (caseRecord.type !== CASE_TYPE.TICKET && caseRecord.type !== CASE_TYPE.ORDER)) return [];
  const access = caseAccess(caseRecord.type);
  if (!hasPermission(context, access.view)) return [];
  const moduleEnabled = await prisma.workspaceModule.count({ where: { workspaceId: context.workspaceId, key: access.module, enabled: true } });
  if (!moduleEnabled) return [];
  return prisma.caseConversation.findMany({
    where: {
      workspaceId: context.workspaceId, caseId,
      case: { is: getCaseScopeFilter(context) },
      conversation: { is: getConversationScopeFilter(context) },
    },
    select: {
      id: true, createdAt: true, conversation: { select: { id: true, client: { select: { name: true } }, externalDisplayName: true } },
      sourceMessages: {
        select: { messageId: true, message: { select: { textBody: true, direction: true, type: true, createdAt: true, sentAt: true, attachments: { select: attachmentPreviewSelect, orderBy: { createdAt: "asc" } } } } },
        orderBy: [{ message: { createdAt: "asc" } }, { messageId: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export const getCaseOrigin = listCaseConversations;
