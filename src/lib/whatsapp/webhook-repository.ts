import { Prisma, RecipientStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getInternalPhoneCandidatesForWhatsApp } from "@/lib/whatsapp/phone";
import {
  WHATSAPP_MESSAGE_DIRECTION,
  WHATSAPP_MESSAGE_STATUS,
  WHATSAPP_MESSAGE_TYPE,
  type ParsedWhatsAppEvent,
  type WhatsAppIncomingMessageEvent,
  type WhatsAppMessageStatus,
  type WhatsAppStatusEvent,
} from "@/lib/whatsapp/webhook-types";

export type WhatsAppWebhookProcessResult = {
  eventKey: string;
  eventType: string;
  duplicate: boolean;
  handled: boolean;
  phoneNumberId: string | null;
  providerMessageId: string | null;
};

type Transaction = Prisma.TransactionClient;

function statusDates(status: WhatsAppMessageStatus, occurredAt: Date) {
  switch (status) {
    case WHATSAPP_MESSAGE_STATUS.SENT: return { sentAt: occurredAt };
    case WHATSAPP_MESSAGE_STATUS.DELIVERED: return { deliveredAt: occurredAt };
    case WHATSAPP_MESSAGE_STATUS.READ: return { readAt: occurredAt };
    case WHATSAPP_MESSAGE_STATUS.FAILED: return { failedAt: occurredAt };
    default: return {};
  }
}

function previousStatusesFor(nextStatus: WhatsAppMessageStatus) {
  switch (nextStatus) {
    case WHATSAPP_MESSAGE_STATUS.SENT:
      return [WHATSAPP_MESSAGE_STATUS.PENDING];
    case WHATSAPP_MESSAGE_STATUS.DELIVERED:
      return [
        WHATSAPP_MESSAGE_STATUS.PENDING,
        WHATSAPP_MESSAGE_STATUS.SENT,
        WHATSAPP_MESSAGE_STATUS.FAILED,
      ];
    case WHATSAPP_MESSAGE_STATUS.READ:
      return [
        WHATSAPP_MESSAGE_STATUS.PENDING,
        WHATSAPP_MESSAGE_STATUS.SENT,
        WHATSAPP_MESSAGE_STATUS.DELIVERED,
        WHATSAPP_MESSAGE_STATUS.FAILED,
      ];
    case WHATSAPP_MESSAGE_STATUS.FAILED:
      return [WHATSAPP_MESSAGE_STATUS.PENDING, WHATSAPP_MESSAGE_STATUS.SENT];
    default:
      return [];
  }
}

async function findMatchingClientId(
  transaction: Transaction,
  workspaceId: string,
  whatsAppPhone: string,
) {
  let candidates: string[];
  try {
    candidates = getInternalPhoneCandidatesForWhatsApp(whatsAppPhone);
  } catch {
    return null;
  }

  const clients = await transaction.client.findMany({
    where: { workspaceId, phoneNormalized: { in: candidates } },
    select: { id: true },
    take: 2,
  });
  return clients.length === 1 ? clients[0].id : null;
}

async function processIncomingMessage(
  transaction: Transaction,
  event: WhatsAppIncomingMessageEvent,
  connection: { id: string; workspaceId: string },
  receivedAt: Date,
) {
  const clientId = await findMatchingClientId(transaction, connection.workspaceId, event.from);
  const sentAt = event.occurredAt ?? receivedAt;
  const created = await transaction.whatsAppMessage.createMany({
    data: [{
      workspaceId: connection.workspaceId,
      connectionId: connection.id,
      clientId,
      providerMessageId: event.providerMessageId,
      phoneNumberId: event.phoneNumberId!,
      waId: event.from,
      direction: WHATSAPP_MESSAGE_DIRECTION.INBOUND,
      type: event.messageType === "TEXT" ? WHATSAPP_MESSAGE_TYPE.TEXT : WHATSAPP_MESSAGE_TYPE.UNSUPPORTED,
      status: WHATSAPP_MESSAGE_STATUS.SENT,
      textBody: event.textBody,
      profileName: event.profileName,
      sentAt,
    }],
    skipDuplicates: true,
  });
  return created.count === 1;
}

async function updateCampaignRecipient(
  transaction: Transaction,
  workspaceId: string,
  event: WhatsAppStatusEvent,
  occurredAt: Date,
) {
  if (event.status === WHATSAPP_MESSAGE_STATUS.SENT) {
    await transaction.campaignRecipient.updateMany({
      where: {
        providerMessageId: event.providerMessageId,
        campaign: { workspaceId },
        status: { in: [RecipientStatus.PENDING, RecipientStatus.PROCESSING] },
      },
      data: { status: RecipientStatus.ACCEPTED, sentAt: occurredAt },
    });
    return;
  }

  if (event.status === WHATSAPP_MESSAGE_STATUS.DELIVERED) {
    await transaction.campaignRecipient.updateMany({
      where: {
        providerMessageId: event.providerMessageId,
        campaign: { workspaceId },
        status: { in: [RecipientStatus.PENDING, RecipientStatus.PROCESSING, RecipientStatus.ACCEPTED, RecipientStatus.FAILED] },
      },
      data: { status: RecipientStatus.DELIVERED, deliveredAt: occurredAt, failedAt: null, errorMessage: null },
    });
    return;
  }

  if (event.status === WHATSAPP_MESSAGE_STATUS.READ) {
    await transaction.campaignRecipient.updateMany({
      where: {
        providerMessageId: event.providerMessageId,
        campaign: { workspaceId },
        status: { not: RecipientStatus.READ },
      },
      data: { status: RecipientStatus.READ, readAt: occurredAt, failedAt: null, errorMessage: null },
    });
    return;
  }

  if (event.status === WHATSAPP_MESSAGE_STATUS.FAILED) {
    await transaction.campaignRecipient.updateMany({
      where: {
        providerMessageId: event.providerMessageId,
        campaign: { workspaceId },
        status: { in: [RecipientStatus.PENDING, RecipientStatus.PROCESSING, RecipientStatus.ACCEPTED] },
      },
      data: { status: RecipientStatus.FAILED, failedAt: occurredAt, errorMessage: event.failureMessage },
    });
  }
}

async function processStatus(
  transaction: Transaction,
  event: WhatsAppStatusEvent,
  connection: { id: string; workspaceId: string },
  receivedAt: Date,
) {
  const occurredAt = event.occurredAt ?? receivedAt;
  const existing = await transaction.whatsAppMessage.findUnique({
    where: { providerMessageId: event.providerMessageId },
    select: { id: true, workspaceId: true },
  });

  if (existing && existing.workspaceId !== connection.workspaceId) return false;

  if (!existing) {
    const recipient = await transaction.campaignRecipient.findFirst({
      where: {
        providerMessageId: event.providerMessageId,
        campaign: { workspaceId: connection.workspaceId },
      },
      select: { clientId: true },
    });
    await transaction.whatsAppMessage.createMany({
      data: [{
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        clientId: recipient?.clientId ?? null,
        providerMessageId: event.providerMessageId,
        phoneNumberId: event.phoneNumberId!,
        waId: event.waId,
        direction: WHATSAPP_MESSAGE_DIRECTION.OUTBOUND,
        type: recipient ? WHATSAPP_MESSAGE_TYPE.TEMPLATE : WHATSAPP_MESSAGE_TYPE.UNSUPPORTED,
        status: event.status,
        ...statusDates(event.status, occurredAt),
        failureCode: event.status === WHATSAPP_MESSAGE_STATUS.FAILED ? event.failureCode : null,
        failureMessage: event.status === WHATSAPP_MESSAGE_STATUS.FAILED ? event.failureMessage : null,
      }],
      skipDuplicates: true,
    });
  } else {
    await transaction.whatsAppMessage.updateMany({
      where: {
        id: existing.id,
        workspaceId: connection.workspaceId,
        status: { in: previousStatusesFor(event.status) },
      },
      data: {
        status: event.status,
        waId: event.waId ?? undefined,
        ...statusDates(event.status, occurredAt),
        ...(event.status === WHATSAPP_MESSAGE_STATUS.FAILED
          ? { failureCode: event.failureCode, failureMessage: event.failureMessage }
          : { failureCode: null, failureMessage: null, failedAt: null }),
      },
    });
  }

  await updateCampaignRecipient(transaction, connection.workspaceId, event, occurredAt);
  return true;
}

export async function persistWhatsAppWebhookEvent(
  event: ParsedWhatsAppEvent,
  receivedAt: Date,
): Promise<WhatsAppWebhookProcessResult> {
  return prisma.$transaction(async (transaction) => {
    const connection = event.phoneNumberId
      ? await transaction.whatsAppConnection.findUnique({
          where: { phoneNumberId: event.phoneNumberId },
          select: { id: true, workspaceId: true },
        })
      : null;

    const inserted = await transaction.whatsAppWebhookEvent.createMany({
      data: [{
        eventKey: event.eventKey,
        workspaceId: connection?.workspaceId ?? null,
        wabaId: event.wabaId,
        phoneNumberId: event.phoneNumberId,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
        receivedAt,
      }],
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      return {
        eventKey: event.eventKey,
        eventType: event.eventType,
        duplicate: true,
        handled: true,
        phoneNumberId: event.phoneNumberId,
        providerMessageId: "providerMessageId" in event ? event.providerMessageId : null,
      };
    }

    let handled = false;
    if (connection && event.phoneNumberId) {
      if (event.kind === "message") {
        handled = await processIncomingMessage(transaction, event, connection, receivedAt);
      } else if (event.kind === "status") {
        handled = await processStatus(transaction, event, connection, receivedAt);
      }
    }

    await transaction.whatsAppWebhookEvent.update({
      where: { eventKey: event.eventKey },
      data: { processedAt: new Date(), processingError: handled || event.kind === "unsupported" ? null : "UNHANDLED" },
    });

    return {
      eventKey: event.eventKey,
      eventType: event.eventType,
      duplicate: false,
      handled,
      phoneNumberId: event.phoneNumberId,
      providerMessageId: "providerMessageId" in event ? event.providerMessageId : null,
    };
  });
}
