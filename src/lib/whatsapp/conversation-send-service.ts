import "server-only";

import { WorkspacePermission } from "@prisma/client";

import { type AuthorizationContext } from "@/lib/authorization";
import { getConversationScopeFilter, requireInboxAccess } from "@/lib/conversation-repository";
import { MetaWhatsAppProvider } from "@/lib/messaging/meta-whatsapp-provider";
import { prisma } from "@/lib/prisma";
import { WhatsAppApiError } from "@/lib/whatsapp/client";
import { getWhatsAppConfiguration, WhatsAppConfigurationError } from "@/lib/whatsapp/config";
import { formatPhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { getWhatsAppServiceWindow, InboxReplyValidationError, normalizeInboxReplyBody } from "@/lib/whatsapp/service-window";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNCONFIGURED = "Esta conexión todavía no tiene credenciales de envío configuradas.";

export class InboxReplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboxReplyError";
  }
}

type Sender = Pick<MetaWhatsAppProvider, "sendTextMessage">;
type SendResult = { messageId: string; status: string; repeated: boolean };

/** El remitente se inyecta solo en tests; el runtime usa la configuración Meta validada para esta conexión. */
export async function sendConversationReply(
  context: AuthorizationContext,
  input: { conversationId: string; body: string; clientRequestId: string },
  options: { sender?: Sender; now?: () => Date } = {},
): Promise<SendResult> {
  await requireInboxAccess(context, WorkspacePermission.INBOX_VIEW);
  await requireInboxAccess(context, WorkspacePermission.INBOX_REPLY);
  if (!REQUEST_ID_PATTERN.test(input.clientRequestId)) throw new InboxReplyValidationError("La solicitud de envío no es válida.");
  const body = normalizeInboxReplyBody(input.body);
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, ...getConversationScopeFilter(context) },
    select: {
      id: true, workspaceId: true, status: true, channel: true, lastInboundAt: true, clientId: true,
      externalParticipantId: true,
      whatsappConnection: { select: { id: true, workspaceId: true, phoneNumberId: true, wabaId: true } },
    },
  });
  if (!conversation) throw new InboxReplyError("La conversación no está disponible.");

  // La misma intención siempre retorna el mismo resultado; jamás invoca Meta dos veces.
  const prior = await prisma.whatsAppMessage.findUnique({
    where: { workspaceId_clientRequestId: { workspaceId: context.workspaceId, clientRequestId: input.clientRequestId } },
    select: { id: true, status: true, conversationId: true, sentByMemberId: true },
  });
  if (prior) {
    if (prior.conversationId !== conversation.id || prior.sentByMemberId !== context.memberId) {
      throw new InboxReplyError("La solicitud de envío no es válida.");
    }
    return { messageId: prior.id, status: prior.status, repeated: true };
  }

  if (conversation.channel !== "WHATSAPP" || !conversation.whatsappConnection || conversation.whatsappConnection.workspaceId !== context.workspaceId) {
    throw new InboxReplyError("Esta conversación no tiene una conexión WhatsApp disponible.");
  }
  const connection = conversation.whatsappConnection;
  if (conversation.status !== "OPEN") throw new InboxReplyError("Reabrí la conversación para responder.");
  const now = options.now?.() ?? new Date();
  if (!getWhatsAppServiceWindow(conversation.lastInboundAt, now).open) {
    throw new InboxReplyError("La ventana de atención de WhatsApp finalizó. Para responder necesitás una plantilla.");
  }
  let recipient: string;
  try { recipient = formatPhoneForWhatsApp(conversation.externalParticipantId, "meta-explicit"); }
  catch { throw new InboxReplyError("El destinatario de WhatsApp no es válido."); }

  let configuration: ReturnType<typeof getWhatsAppConfiguration>;
  try { configuration = getWhatsAppConfiguration(); }
  catch (error) {
    if (error instanceof WhatsAppConfigurationError) throw new InboxReplyError(UNCONFIGURED);
    throw error;
  }
  if (configuration.phoneNumberId !== connection.phoneNumberId || configuration.wabaId !== connection.wabaId) {
    throw new InboxReplyError(UNCONFIGURED);
  }

  const inserted = await prisma.$transaction(async (transaction) => {
    const result = await transaction.whatsAppMessage.createMany({
      data: [{
        workspaceId: context.workspaceId,
        connectionId: connection.id,
        conversationId: conversation.id,
        clientId: conversation.clientId,
        clientRequestId: input.clientRequestId,
        sentByMemberId: context.memberId,
        sentByUserId: context.userId,
        phoneNumberId: connection.phoneNumberId,
        waId: recipient,
        direction: "OUTBOUND",
        type: "TEXT",
        status: "PENDING",
        textBody: body,
      }],
      skipDuplicates: true,
    });
    if (result.count) await transaction.$executeRaw`
      UPDATE "Conversation" SET "lastMessageAt" = GREATEST("lastMessageAt", ${now}),
        "lastOutboundAt" = GREATEST(COALESCE("lastOutboundAt", ${now}), ${now}), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${conversation.id} AND "workspaceId" = ${context.workspaceId}
    `;
    return result.count;
  });
  const intent = await prisma.whatsAppMessage.findUniqueOrThrow({
    where: { workspaceId_clientRequestId: { workspaceId: context.workspaceId, clientRequestId: input.clientRequestId } },
    select: { id: true, status: true, conversationId: true, sentByMemberId: true },
  });
  if (!inserted) {
    if (intent.conversationId !== conversation.id || intent.sentByMemberId !== context.memberId) throw new InboxReplyError("La solicitud de envío no es válida.");
    return { messageId: intent.id, status: intent.status, repeated: true };
  }
  const claimed = await prisma.whatsAppMessage.updateMany({
    where: { id: intent.id, status: "PENDING" }, data: { status: "PROCESSING" },
  });
  if (!claimed.count) return { messageId: intent.id, status: "PROCESSING", repeated: true };

  // No hay transacción abierta durante el request externo.
  try {
    const sender = options.sender ?? new MetaWhatsAppProvider();
    const result = await sender.sendTextMessage({
      phone: recipient, recipientFormat: "meta-explicit", text: body, clientRequestId: input.clientRequestId,
      signal: AbortSignal.timeout(15_000),
    });
    // Un webhook puede haberse adelantado: nunca degradar SENT/DELIVERED/READ.
    await prisma.whatsAppMessage.updateMany({
      where: { id: intent.id, providerMessageId: null },
      data: { providerMessageId: result.providerMessageId },
    });
    await prisma.whatsAppMessage.updateMany({
      where: { id: intent.id, status: "PROCESSING" }, data: { status: "ACCEPTED" },
    });
  } catch (error) {
    const ambiguous = !(error instanceof WhatsAppApiError) || error.httpStatus === 0 || error.httpStatus < 400;
    await prisma.whatsAppMessage.updateMany({
      where: { id: intent.id, status: "PROCESSING" },
      data: ambiguous
        ? { status: "UNKNOWN", failureCode: "UNCONFIRMED", failureMessage: "No pudimos confirmar el envío." }
        : { status: "FAILED", failedAt: new Date(), failureCode: String(error.metaCode ?? error.httpStatus), failureMessage: "Meta rechazó el mensaje." },
    });
  }
  const current = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: intent.id }, select: { status: true } });
  return { messageId: intent.id, status: current.status, repeated: false };
}
