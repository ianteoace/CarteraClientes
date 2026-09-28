import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { attachCampaignMessageToExistingConversation } from "@/lib/conversation-core";
import type { MetaProviderSendResult } from "@/lib/messaging/meta-whatsapp-provider";
import type { CampaignExecutionContext } from "@/lib/campaign-send-repository";

export async function createCampaignOutboundIntent(context: CampaignExecutionContext, campaignId: string, recipientId: string, connectionId: string, textBody: string) {
  return prisma.$transaction(async (transaction) => {
    const recipient = await transaction.campaignRecipient.findFirst({ where: { id: recipientId, campaignId, status: "PROCESSING", campaign: { workspaceId: context.workspaceId, deliveryMode: "META_WHATSAPP", status: "SENDING" } }, select: { clientId: true } });
    const connection = await transaction.whatsAppConnection.findFirst({ where: { id: connectionId, workspaceId: context.workspaceId, status: "ACTIVE" }, select: { id: true, phoneNumberId: true } });
    if (!recipient || !connection) throw new Error("Campaign outbound intent unavailable");
    const inserted = await transaction.whatsAppMessage.createMany({ data: [{
      workspaceId: context.workspaceId, connectionId, campaignRecipientId: recipientId,
      clientId: recipient.clientId, phoneNumberId: connection.phoneNumberId,
      clientRequestId: randomUUID(), direction: "OUTBOUND", type: "TEMPLATE", status: "PROCESSING", textBody,
    }], skipDuplicates: true });
    const intent = await transaction.whatsAppMessage.findUniqueOrThrow({ where: { campaignRecipientId: recipientId }, select: { id: true, workspaceId: true, connectionId: true, clientRequestId: true } });
    if (intent.workspaceId !== context.workspaceId || intent.connectionId !== connectionId) throw new Error("Campaign outbound routing mismatch");
    return { ...intent, created: inserted.count === 1 };
  });
}

export async function acceptCampaignOutbound(context: CampaignExecutionContext, recipientId: string, messageId: string, result: MetaProviderSendResult) {
  await prisma.$transaction(async (transaction) => {
    // The opaque intent lets an early webhook bind the same wamid. Never overwrite a different id.
    await transaction.whatsAppMessage.updateMany({ where: { id: messageId, workspaceId: context.workspaceId, campaignRecipientId: recipientId, providerMessageId: null }, data: { providerMessageId: result.providerMessageId } });
    const message = await transaction.whatsAppMessage.findFirstOrThrow({ where: { id: messageId, workspaceId: context.workspaceId, providerMessageId: result.providerMessageId, campaignRecipientId: recipientId } });
    await transaction.whatsAppMessage.updateMany({ where: { id: message.id, status: "PROCESSING" }, data: { status: "ACCEPTED" } });
    await transaction.whatsAppMessage.updateMany({ where: { id: message.id, sentAt: null }, data: { sentAt: result.acceptedAt } });
    if (result.waId) await transaction.whatsAppMessage.updateMany({ where: { id: message.id, waId: null }, data: { waId: result.waId } });
    await transaction.campaignRecipient.updateMany({ where: { id: recipientId, campaign: { workspaceId: context.workspaceId } }, data: { providerMessageId: result.providerMessageId, dispatchAcceptedAt: result.acceptedAt } });
    await transaction.campaignRecipient.updateMany({ where: { id: recipientId, sentAt: null, campaign: { workspaceId: context.workspaceId } }, data: { sentAt: result.acceptedAt } });
    await transaction.campaignRecipient.updateMany({ where: { id: recipientId, status: "PROCESSING", campaign: { workspaceId: context.workspaceId } }, data: { status: "ACCEPTED", sentAt: result.acceptedAt } });
    const waId = message.waId ?? result.waId;
    if (waId && message.connectionId) await attachCampaignMessageToExistingConversation(transaction, { messageId: message.id, workspaceId: context.workspaceId, connectionId: message.connectionId, participantId: waId, occurredAt: result.acceptedAt });
  });
}

export async function failCampaignOutbound(context: CampaignExecutionContext, recipientId: string, messageId: string | null, ambiguous: boolean, failureCode: string) {
  await prisma.$transaction(async (transaction) => {
    const message = ambiguous ? "No pudimos confirmar el envío. Requiere revisión; no se reintentará automáticamente." : "Meta rechazó el envío de la plantilla.";
    if (messageId) await transaction.whatsAppMessage.updateMany({ where: { id: messageId, workspaceId: context.workspaceId, status: "PROCESSING" }, data: { status: ambiguous ? "UNKNOWN" : "FAILED", failureCode, failureMessage: message, failedAt: ambiguous ? null : new Date() } });
    await transaction.campaignRecipient.updateMany({ where: { id: recipientId, status: "PROCESSING", campaign: { workspaceId: context.workspaceId } }, data: { status: ambiguous ? "UNKNOWN" : "FAILED", failureCode, errorMessage: message, failedAt: ambiguous ? null : new Date() } });
  });
}
