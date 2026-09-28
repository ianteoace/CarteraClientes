import "server-only";

import { Prisma, WorkspacePermission } from "@prisma/client";

import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { getClientScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { attachmentPreviewSelect } from "@/lib/whatsapp/attachment-types";

export class ConversationNotFoundError extends Error {}

// Regla temporal: miembros SELECTED solo ven conversaciones de contactos
// dentro de sus grupos; las conversaciones sin contacto quedan ocultas.
export function getConversationScopeFilter(context: AuthorizationContext): Prisma.ConversationWhereInput {
  return {
    workspaceId: context.workspaceId,
    ...(!hasAllGroups(context) ? { client: { is: getClientScopeFilter(context) } } : {}),
  };
}

export async function requireInboxAccess(context: AuthorizationContext, permission: WorkspacePermission = WorkspacePermission.INBOX_VIEW) {
  await requireModule(context, WORKSPACE_MODULE.INBOX);
  requirePermission(context, permission);
}

export type InboxFilter = "all" | "unread";
export type InboxChannel = "all" | "WHATSAPP" | "EMAIL";

export async function listConversations(
  context: AuthorizationContext,
  input: { search?: string; filter?: InboxFilter; channel?: InboxChannel; cursor?: string },
) {
  await requireInboxAccess(context);
  const search = input.search?.trim().slice(0, 100) ?? "";
  const cursor = input.cursor
    ? await prisma.conversation.findFirst({
        where: { id: input.cursor, ...getConversationScopeFilter(context) },
        select: { id: true, lastMessageAt: true },
      })
    : null;

  const scopeSql = hasAllGroups(context) ? Prisma.empty : Prisma.sql`
    AND cl."id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "ClientGroup" cg
      INNER JOIN "MemberGroupAccess" mga ON mga."groupId" = cg."groupId"
      INNER JOIN "Group" g ON g."id" = cg."groupId" AND g."workspaceId" = c."workspaceId"
      WHERE cg."clientId" = c."clientId" AND mga."memberId" = ${context.memberId}
    )`;
  const searchSql = search ? Prisma.sql`
    AND (cl."name" ILIKE ${`%${search}%`} OR cl."phone" ILIKE ${`%${search}%`}
      OR cl."email" ILIKE ${`%${search}%`} OR c."externalDisplayName" ILIKE ${`%${search}%`}
      OR c."externalParticipantId" ILIKE ${`%${search}%`} OR c."subject" ILIKE ${`%${search}%`}
      OR EXISTS (SELECT 1 FROM "EmailMessage" em WHERE em."conversationId" = c."id"
        AND em."workspaceId" = c."workspaceId"
        AND (em."fromAddress" ILIKE ${`%${search}%`} OR em."fromName" ILIKE ${`%${search}%`} OR em."subject" ILIKE ${`%${search}%`})))` : Prisma.empty;
  const isUnread = Prisma.sql`(EXISTS (
      SELECT 1 FROM "WhatsAppMessage" incoming
      WHERE incoming."conversationId" = c."id" AND incoming."workspaceId" = c."workspaceId" AND incoming."direction" = 'INBOUND'
        AND COALESCE(incoming."sentAt", incoming."createdAt") >
          COALESCE(rs."lastReadAt", '-infinity'::timestamp)
    ) OR EXISTS (
      SELECT 1 FROM "EmailMessage" incoming
      WHERE incoming."conversationId" = c."id" AND incoming."workspaceId" = c."workspaceId" AND incoming."direction" = 'INBOUND'
        AND incoming."receivedAt" > COALESCE(rs."lastReadAt", '-infinity'::timestamp)
    ))`;
  const unreadSql = input.filter === "unread" ? Prisma.sql`AND ${isUnread}` : Prisma.empty;
  const channelSql = input.channel && input.channel !== "all" ? Prisma.sql`AND c."channel" = ${input.channel}` : Prisma.empty;
  const cursorSql = cursor ? Prisma.sql`
    AND (c."lastMessageAt" < ${cursor.lastMessageAt}
      OR (c."lastMessageAt" = ${cursor.lastMessageAt} AND c."id" < ${cursor.id}))` : Prisma.empty;

  const ids = await prisma.$queryRaw<Array<{ id: string; unread: boolean; emailSubject: string | null; emailSnippet: string | null }>>`
    SELECT c."id", ${isUnread} AS "unread", latest."subject" AS "emailSubject", latest."snippet" AS "emailSnippet"
    FROM "Conversation" c
    LEFT JOIN "Client" cl ON cl."id" = c."clientId" AND cl."workspaceId" = c."workspaceId"
    LEFT JOIN "ConversationReadState" rs ON rs."conversationId" = c."id" AND rs."memberId" = ${context.memberId}
    LEFT JOIN LATERAL (
      SELECT em."subject", LEFT(em."textBody", 90) AS "snippet" FROM "EmailMessage" em
      WHERE em."conversationId" = c."id" AND em."workspaceId" = c."workspaceId"
      ORDER BY em."receivedAt" DESC, em."id" DESC LIMIT 1
    ) latest ON c."channel" = 'EMAIL'
    WHERE c."workspaceId" = ${context.workspaceId}
      ${scopeSql} ${searchSql} ${unreadSql} ${channelSql} ${cursorSql}
    ORDER BY c."lastMessageAt" DESC, c."id" DESC
    LIMIT 31
  `;
  const pageIds = ids.slice(0, 30);
  const rows = await prisma.conversation.findMany({
    where: { id: { in: pageIds.map(({ id }) => id) }, ...getConversationScopeFilter(context) },
    select: {
      id: true, channel: true, status: true, subject: true, externalParticipantId: true, externalDisplayName: true,
      lastMessageAt: true, client: { select: { id: true, name: true, company: true } },
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { type: true, textBody: true, attachments: { take: 1, select: { caption: true } } } },
    },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return {
    items: pageIds.flatMap(({ id, unread, emailSubject, emailSnippet }) => {
      const row = rowById.get(id);
      return row ? [{ ...row, unread, lastMessage: row.messages[0] ?? null, emailPreview: emailSubject ? { subject: emailSubject, snippet: emailSnippet } : null }] : [];
    }),
    nextCursor: ids.length > 30 ? pageIds.at(-1)?.id ?? null : null,
  };
}

export async function getConversationDetails(context: AuthorizationContext, id: string, before?: string) {
  await requireInboxAccess(context);
  const conversation = await prisma.conversation.findFirst({
    where: { id, ...getConversationScopeFilter(context) },
    select: {
      id: true, workspaceId: true, channel: true, status: true, clientId: true, subject: true,
      externalParticipantId: true, externalDisplayName: true, lastMessageAt: true,
      lastInboundAt: true,
      client: { select: { id: true, name: true, company: true } },
    },
  });
  if (!conversation) return null;
  const emailCursor = conversation.channel === "EMAIL" && before ? await prisma.emailMessage.findFirst({
    where: { id: before, conversationId: id, workspaceId: context.workspaceId }, select: { id: true, receivedAt: true },
  }) : null;
  const emails = conversation.channel === "EMAIL" ? await prisma.emailMessage.findMany({ where: {
    conversationId: id, workspaceId: context.workspaceId,
    ...(emailCursor ? { OR: [{ receivedAt: { lt: emailCursor.receivedAt } }, { receivedAt: emailCursor.receivedAt, id: { lt: emailCursor.id } }] } : {}),
  }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 101,
    select: { id: true, fromAddress: true, fromName: true, subject: true, textBody: true, receivedAt: true, createdAt: true, attachmentCount: true },
  }) : [];
  const cursor = conversation.channel === "WHATSAPP" && before ? await prisma.whatsAppMessage.findFirst({
    where: { id: before, conversationId: id, workspaceId: context.workspaceId },
    select: { id: true, createdAt: true },
  }) : null;
  const messages = conversation.channel === "WHATSAPP" ? await prisma.whatsAppMessage.findMany({
    where: {
      conversationId: id, workspaceId: context.workspaceId,
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101,
    select: { id: true, direction: true, type: true, status: true, textBody: true, createdAt: true, sentAt: true,
      sentByMemberId: true, sentByUserId: true,
      attachments: { select: attachmentPreviewSelect, orderBy: { createdAt: "asc" } },
    },
  }) : [];
  const page = messages.slice(0, 100);
  const olderCursor = conversation.channel === "EMAIL"
    ? (emails.length > 100 ? emails[99].id : null)
    : (messages.length > 100 ? page.at(-1)?.id ?? null : null);
  const actorIds = [...new Set(page.flatMap((message) => message.sentByMemberId ? [message.sentByMemberId] : []))];
  const actors = actorIds.length ? await prisma.workspaceMember.findMany({
    where: { id: { in: actorIds }, workspaceId: context.workspaceId },
    select: { id: true, acceptedInvitations: { take: 1, orderBy: { acceptedAt: "desc" }, select: { email: true } } },
  }) : [];
  return {
    ...conversation,
    messages: page.reverse(),
    emailMessages: emails.slice(0, 100).reverse(),
    olderCursor,
    actorLabels: Object.fromEntries(actors.map((actor) => [actor.id, actor.acceptedInvitations[0]?.email ?? null])),
  };
}

export async function markConversationRead(context: AuthorizationContext, id: string) {
  await requireInboxAccess(context);
  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findFirst({
      where: { id, ...getConversationScopeFilter(context) }, select: { id: true, channel: true },
    });
    if (!conversation) throw new ConversationNotFoundError();
    const emailLatest = conversation.channel === "EMAIL" ? await transaction.emailMessage.findFirst({
      where: { conversationId: id, workspaceId: context.workspaceId, direction: "INBOUND" },
      orderBy: { receivedAt: "desc" }, select: { receivedAt: true },
    }) : null;
    const latest = conversation.channel === "WHATSAPP" ? await transaction.whatsAppMessage.findFirst({
      where: { conversationId: id, workspaceId: context.workspaceId, direction: "INBOUND" },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      select: { sentAt: true, createdAt: true },
    }) : null;
    const lastReadAt = emailLatest?.receivedAt ?? latest?.sentAt ?? latest?.createdAt;
    if (!lastReadAt) return;
    await transaction.conversationReadState.upsert({
      where: { conversationId_memberId: { conversationId: id, memberId: context.memberId } },
      create: { conversationId: id, memberId: context.memberId, lastReadAt },
      update: {},
    });
    await transaction.$executeRaw`
      UPDATE "ConversationReadState" SET "lastReadAt" = GREATEST("lastReadAt", ${lastReadAt}), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "conversationId" = ${id} AND "memberId" = ${context.memberId}
    `;
  });
}

export async function listLinkableClients(context: AuthorizationContext, search: string) {
  await requireInboxAccess(context, WorkspacePermission.INBOX_MANAGE);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  const query = search.trim().slice(0, 100);
  return prisma.client.findMany({
    where: {
      ...getClientScopeFilter(context),
      ...(query ? { OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
      ] } : {}),
    },
    select: { id: true, name: true, phone: true, company: true },
    orderBy: { name: "asc" }, take: 20,
  });
}

export async function linkConversationContact(context: AuthorizationContext, id: string, clientId: string) {
  await requireInboxAccess(context, WorkspacePermission.INBOX_MANAGE);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  return associateContact(context, id, clientId, false);
}

export async function linkNewlyCreatedContact(context: AuthorizationContext, id: string, clientId: string) {
  await requireInboxAccess(context, WorkspacePermission.INBOX_MANAGE);
  requirePermission(context, WorkspacePermission.CONTACT_CREATE);
  return associateContact(context, id, clientId, true);
}

async function associateContact(context: AuthorizationContext, id: string, clientId: string, newlyCreated: boolean) {
  return prisma.$transaction(async (transaction) => {
    const [conversation, client] = await Promise.all([
      transaction.conversation.findFirst({ where: { id, ...getConversationScopeFilter(context) }, select: { id: true, clientId: true } }),
      transaction.client.findFirst({ where: { id: clientId, ...(newlyCreated ? { workspaceId: context.workspaceId } : getClientScopeFilter(context)) }, select: { id: true, name: true } }),
    ]);
    if (!conversation || !client) throw new ConversationNotFoundError();
    if (conversation.clientId === client.id) return;
    await transaction.conversation.update({ where: { id: conversation.id }, data: { clientId: client.id } });
    await transaction.whatsAppMessage.updateMany({
      where: { conversationId: conversation.id, workspaceId: context.workspaceId },
      data: { clientId: client.id },
    });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONVERSATION,
      entityId: conversation.id, action: ACTIVITY_ACTION.CONVERSATION_CONTACT_LINKED,
      metadata: { name: client.name },
    }, transaction);
  });
}

export async function setConversationArchived(context: AuthorizationContext, id: string, archived: boolean) {
  await requireInboxAccess(context, WorkspacePermission.INBOX_MANAGE);
  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findFirst({
      where: { id, ...getConversationScopeFilter(context) }, select: { id: true, status: true },
    });
    if (!conversation) throw new ConversationNotFoundError();
    const status = archived ? "ARCHIVED" : "OPEN";
    if (conversation.status === status) return;
    await transaction.conversation.update({ where: { id: conversation.id }, data: { status } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CONVERSATION,
      entityId: conversation.id,
      action: archived ? ACTIVITY_ACTION.CONVERSATION_ARCHIVED : ACTIVITY_ACTION.CONVERSATION_REOPENED,
    }, transaction);
  });
}

export async function getRecentConversationsForContact(context: AuthorizationContext, clientId: string) {
  await requireInboxAccess(context);
  return prisma.conversation.findMany({
    where: { clientId, ...getConversationScopeFilter(context) },
    orderBy: { lastMessageAt: "desc" }, take: 5,
    select: { id: true, channel: true, subject: true, lastMessageAt: true,
      emailMessages: { orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 1, select: { subject: true, textBody: true } },
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { type: true, textBody: true, attachments: { take: 1, select: { caption: true } } } },
    },
  });
}
