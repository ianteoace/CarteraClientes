import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeOptionalEmail } from "@/lib/email";
import type { InboundEmail } from "@/lib/email-inbound/types";
import { safeEmailText } from "@/lib/email-inbound/content";

export async function findEmailClientId(transaction: Prisma.TransactionClient, workspaceId: string, from: string) {
  const address = normalizeOptionalEmail(from);
  const matches = await transaction.client.findMany({ where: { workspaceId, email: { equals: address, mode: "insensitive" } }, select: { id: true }, take: 2 });
  return matches.length === 1 ? matches[0].id : null;
}

export async function persistInboundEmail(transaction: Prisma.TransactionClient, connection: { id: string; workspaceId: string }, email: InboundEmail) {
  // Serialize thread resolution for this connection. Also covers concurrent/replayed deliveries.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email:${connection.id}`}, 0))`;
  const active = await transaction.emailConnection.findFirst({ where: { id: connection.id, workspaceId: connection.workspaceId, status: "ACTIVE" }, select: { id: true } });
  if (!active) return null;
  const repeated = await transaction.emailMessage.findFirst({ where: { emailConnectionId: connection.id,
    OR: [{ providerMessageId: email.providerMessageId }, ...(email.internetMessageId ? [{ internetMessageId: email.internetMessageId }] : [])],
  }, select: { id: true, conversationId: true } });
  if (repeated) return { ...repeated, duplicate: true };

  const references = [...new Set([...(email.inReplyTo ? [email.inReplyTo] : []), ...email.references.slice().reverse()])];
  const previous = references.length ? await transaction.emailMessage.findMany({ where: {
    workspaceId: connection.workspaceId, emailConnectionId: connection.id, internetMessageId: { in: references },
  }, select: { internetMessageId: true, conversationId: true } }) : [];
  const anchor = references.flatMap((id) => previous.filter((entry) => entry.internetMessageId === id))[0];
  const rootId = email.references[0] ?? email.inReplyTo ?? email.internetMessageId ?? `resend:${email.providerMessageId}`;
  const threadKey = createHash("sha256").update(rootId).digest("hex");
  const clientId = await findEmailClientId(transaction, connection.workspaceId, email.fromAddress);
  const existing = anchor ? await transaction.conversation.findFirst({ where: { id: anchor.conversationId, workspaceId: connection.workspaceId, emailConnectionId: connection.id, channel: "EMAIL" }, select: { id: true } }) : null;
  const conversation = existing ?? await transaction.conversation.upsert({ where: {
    workspaceId_emailConnectionId_externalThreadId: { workspaceId: connection.workspaceId, emailConnectionId: connection.id, externalThreadId: threadKey },
  }, create: { workspaceId: connection.workspaceId, emailConnectionId: connection.id, channel: "EMAIL",
    externalThreadId: threadKey, subject: email.subject, externalParticipantId: email.fromAddress,
    externalDisplayName: email.fromName, clientId, lastMessageAt: email.receivedAt, lastInboundAt: email.receivedAt,
  }, update: {}, select: { id: true } });
  const message = await transaction.emailMessage.create({ data: { ...email, workspaceId: connection.workspaceId,
    conversationId: conversation.id, emailConnectionId: connection.id, direction: "INBOUND",
    textBody: email.textBody?.trim() ? email.textBody : (safeEmailText(null, email.htmlBody).slice(0, 250000) || null),
  }, select: { id: true } });
  await transaction.$executeRaw`UPDATE "Conversation" SET
    "lastMessageAt" = GREATEST("lastMessageAt", ${email.receivedAt}),
    "lastInboundAt" = GREATEST(COALESCE("lastInboundAt", ${email.receivedAt}), ${email.receivedAt}),
    "clientId" = COALESCE("clientId", ${clientId}), "status" = 'OPEN', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${conversation.id} AND "workspaceId" = ${connection.workspaceId}`;
  return { id: message.id, conversationId: conversation.id, duplicate: false };
}
