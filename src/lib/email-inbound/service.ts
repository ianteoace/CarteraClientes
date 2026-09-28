import "server-only";

import { prisma } from "@/lib/prisma";
import { persistInboundEmail } from "@/lib/email-inbound/repository";
import { ResendEmailInboundProvider } from "@/lib/email-inbound/resend-provider";
import type { EmailInboundEvent, EmailInboundProvider } from "@/lib/email-inbound/types";

export async function processEmailInboundEvent(event: EmailInboundEvent, provider: EmailInboundProvider = new ResendEmailInboundProvider()) {
  const audit = await prisma.emailWebhookEvent.upsert({ where: { eventKey: event.eventKey },
    create: { provider: event.provider, eventKey: event.eventKey, eventType: event.eventType,
      providerMessageId: event.providerMessageId,
      // No bodies, addresses, auth headers, signatures or raw MIME in the technical audit.
      payload: { eventType: event.eventType, providerMessageId: event.providerMessageId },
    }, update: {}, select: { id: true, processedAt: true },
  });
  if (audit.processedAt) return { duplicate: true, handled: true, messages: 0 };
  try {
    const connections = event.eventType === "email.received" && event.providerMessageId ? await prisma.emailConnection.findMany({
      where: { provider: event.provider, status: "ACTIVE", address: { in: event.toAddresses } },
      select: { id: true, workspaceId: true }, orderBy: { id: "asc" },
    }) : [];
    const email = connections.length && event.providerMessageId ? await provider.retrieveEmail(event.providerMessageId) : null;
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${event.eventKey}, 0))`;
      const current = await transaction.emailWebhookEvent.findUniqueOrThrow({ where: { id: audit.id } });
      if (current.processedAt) return { duplicate: true, handled: true, messages: 0 };
      let messages = 0;
      for (const connection of connections) {
        if (!email) continue;
        const result = await persistInboundEmail(transaction, connection, email);
        if (result && !result.duplicate) messages++;
      }
      await transaction.emailWebhookEvent.update({ where: { id: audit.id }, data: {
        workspaceId: connections.length === 1 ? connections[0].workspaceId : null,
        processedAt: new Date(), processingError: null,
        payload: { eventType: event.eventType, providerMessageId: event.providerMessageId, connections: connections.length, messages },
      } });
      return { duplicate: false, handled: connections.length > 0, messages };
    }, { timeout: 20000 });
  } catch (error) {
    await prisma.emailWebhookEvent.updateMany({ where: { id: audit.id, processedAt: null }, data: { processingError: "EMAIL_PROCESSING_FAILED" } }).catch(() => {});
    throw error;
  }
}
