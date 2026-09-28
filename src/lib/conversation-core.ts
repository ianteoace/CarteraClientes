import "server-only";

import { Prisma } from "@prisma/client";

import { getInternalPhoneCandidatesForWhatsApp } from "@/lib/whatsapp/phone";

type Transaction = Prisma.TransactionClient;

export async function findWhatsAppClientId(transaction: Transaction, workspaceId: string, participantId: string) {
  let candidates: string[];
  try {
    candidates = getInternalPhoneCandidatesForWhatsApp(participantId);
  } catch {
    return null;
  }
  const matches = await transaction.client.findMany({
    where: { workspaceId, phoneNormalized: { in: candidates } },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0].id : null;
}

export async function attachWhatsAppMessageToConversation(
  transaction: Transaction,
  input: {
    messageId: string;
    workspaceId: string;
    connectionId: string;
    participantId: string;
    direction: "INBOUND" | "OUTBOUND";
    occurredAt: Date;
    profileName?: string | null;
    clientId?: string | null;
  },
) {
  const participantId = input.participantId.trim();
  if (!participantId) return null;
  const connection = await transaction.whatsAppConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId },
    select: { id: true },
  });
  if (!connection) return null;
  const message = await transaction.whatsAppMessage.findFirst({
    where: { id: input.messageId, workspaceId: input.workspaceId, connectionId: connection.id },
    select: { id: true },
  });
  if (!message) return null;

  const matchedClientId = input.clientId
    ?? await findWhatsAppClientId(transaction, input.workspaceId, participantId);
  const profileName = input.profileName?.trim().slice(0, 255) || null;
  const conversation = await transaction.conversation.upsert({
    where: {
      workspaceId_whatsappConnectionId_externalParticipantId: {
        workspaceId: input.workspaceId,
        whatsappConnectionId: connection.id,
        externalParticipantId: participantId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      whatsappConnectionId: connection.id,
      externalParticipantId: participantId,
      channel: "WHATSAPP",
      clientId: matchedClientId,
      externalDisplayName: profileName,
      status: "OPEN",
      lastMessageAt: input.occurredAt,
      lastInboundAt: input.direction === "INBOUND" ? input.occurredAt : null,
      lastOutboundAt: input.direction === "OUTBOUND" ? input.occurredAt : null,
    },
    update: {},
    select: { id: true, clientId: true },
  });

  // GREATEST evita que webhooks antiguos o concurrentes degraden las fechas.
  await transaction.$executeRaw`
    UPDATE "Conversation" SET
      "lastMessageAt" = GREATEST("lastMessageAt", ${input.occurredAt}),
      "lastInboundAt" = CASE WHEN ${input.direction} = 'INBOUND'
        THEN GREATEST(COALESCE("lastInboundAt", ${input.occurredAt}), ${input.occurredAt})
        ELSE "lastInboundAt" END,
      "lastOutboundAt" = CASE WHEN ${input.direction} = 'OUTBOUND'
        THEN GREATEST(COALESCE("lastOutboundAt", ${input.occurredAt}), ${input.occurredAt})
        ELSE "lastOutboundAt" END,
      "externalDisplayName" = COALESCE(${profileName}, "externalDisplayName"),
      "clientId" = COALESCE("clientId", ${matchedClientId}),
      "status" = CASE WHEN ${input.direction} = 'INBOUND' THEN 'OPEN' ELSE "status" END,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${conversation.id} AND "workspaceId" = ${input.workspaceId}
  `;
  await transaction.whatsAppMessage.updateMany({
    where: { id: message.id, workspaceId: input.workspaceId, connectionId: connection.id },
    data: { conversationId: conversation.id },
  });
  if (input.direction === "INBOUND") {
    // Restore campaign context only after the participant actually starts/replies to a thread.
    await transaction.whatsAppMessage.updateMany({ where: {
      workspaceId: input.workspaceId, connectionId: connection.id, waId: participantId,
      campaignRecipientId: { not: null }, direction: "OUTBOUND", conversationId: null,
    }, data: { conversationId: conversation.id } });
  }
  return conversation.id;
}

/** Campaigns never create an Inbox row, unread state or bump Inbox ordering. */
export async function attachCampaignMessageToExistingConversation(transaction: Transaction, input: {
  messageId: string; workspaceId: string; connectionId: string; participantId: string; occurredAt: Date;
}) {
  const conversation = await transaction.conversation.findFirst({ where: { workspaceId: input.workspaceId, whatsappConnectionId: input.connectionId, externalParticipantId: input.participantId }, select: { id: true } });
  if (!conversation) return null;
  const attached = await transaction.whatsAppMessage.updateMany({ where: { id: input.messageId, workspaceId: input.workspaceId, connectionId: input.connectionId, campaignRecipientId: { not: null }, waId: input.participantId, direction: "OUTBOUND" }, data: { conversationId: conversation.id } });
  if (attached.count) await transaction.$executeRaw`UPDATE "Conversation" SET
    "lastOutboundAt" = GREATEST(COALESCE("lastOutboundAt", ${input.occurredAt}), ${input.occurredAt})
    WHERE id = ${conversation.id} AND "workspaceId" = ${input.workspaceId}`;
  return conversation.id;
}
