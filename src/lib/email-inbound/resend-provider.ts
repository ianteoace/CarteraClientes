import "server-only";

import { Webhook } from "svix";
import { emailMessageIds, mailboxAddresses, parseMailbox, readLimitedBody } from "@/lib/email-inbound/content";
import {
  EmailInboundConfigurationError, EmailInboundPayloadError, EmailInboundProviderError,
  EmailInboundSignatureError, type EmailInboundEvent, type EmailInboundProvider, type InboundEmail,
} from "@/lib/email-inbound/types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EmailInboundPayloadError();
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : null;
}

export function parseResendEmail(value: unknown, expectedId: string): InboundEmail {
  const raw = record(value);
  if (raw.id !== expectedId) throw new EmailInboundPayloadError();
  const headers = Object.fromEntries(Object.entries(raw.headers ? record(raw.headers) : {}).map(([name, value]) => [name.toLowerCase(), value]));
  const from = parseMailbox(headers.from ?? raw.from);
  const receivedAt = new Date(String(raw.created_at));
  if (!Number.isFinite(receivedAt.getTime())) throw new EmailInboundPayloadError();
  return {
    providerMessageId: expectedId,
    internetMessageId: emailMessageIds(raw.message_id ?? headers["message-id"])[0] ?? null,
    inReplyTo: emailMessageIds(headers["in-reply-to"])[0] ?? null,
    references: emailMessageIds(headers.references),
    fromAddress: from.address, fromName: from.name,
    toAddresses: mailboxAddresses(raw.to), ccAddresses: mailboxAddresses(raw.cc ?? []),
    subject: boundedText(raw.subject, 1000)?.trim() || "Sin asunto",
    textBody: boundedText(raw.text, 250000), htmlBody: boundedText(raw.html, 1000000),
    attachmentCount: Array.isArray(raw.attachments) ? Math.min(raw.attachments.length, 1000) : 0,
    receivedAt,
  };
}

export class ResendEmailInboundProvider implements EmailInboundProvider {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env, private readonly request: typeof fetch = fetch) {}

  verifyWebhook(rawBody: string, headers: Headers): EmailInboundEvent {
    const secret = this.environment.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
    if (!secret) throw new EmailInboundConfigurationError("Falta configurar el webhook de email.");
    try {
      new Webhook(secret).verify(rawBody, {
        "svix-id": headers.get("svix-id") ?? "",
        "svix-timestamp": headers.get("svix-timestamp") ?? "",
        "svix-signature": headers.get("svix-signature") ?? "",
      });
    } catch { throw new EmailInboundSignatureError(); }
    // Svix 2 verifies the raw bytes and returns void; parse only after verification.
    let verified: unknown;
    try { verified = JSON.parse(rawBody); } catch { throw new EmailInboundPayloadError(); }
    const raw = record(verified);
    const type = boundedText(raw.type, 100);
    const eventId = headers.get("svix-id");
    if (!type || !eventId || eventId.length > 255) throw new EmailInboundPayloadError();
    if (type !== "email.received") return { provider: "RESEND", eventKey: `resend:${eventId}`, eventType: type, providerMessageId: null, toAddresses: [] };
    const data = record(raw.data);
    const id = boundedText(data.email_id, 100);
    if (!id || !/^[\w-]{1,100}$/.test(id)) throw new EmailInboundPayloadError();
    return { provider: "RESEND", eventKey: `resend:${eventId}`, eventType: type,
      providerMessageId: id, toAddresses: mailboxAddresses(data.to),
    };
  }

  async retrieveEmail(providerMessageId: string): Promise<InboundEmail> {
    const key = this.environment.RESEND_INBOUND_API_KEY?.trim();
    if (!key) throw new EmailInboundConfigurationError("Falta configurar la lectura de emails en Resend.");
    try {
      const response = await this.request(`https://api.resend.com/emails/receiving/${encodeURIComponent(providerMessageId)}?html_format=cid`, {
        method: "GET", headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000), cache: "no-store",
      });
      if (!response.ok) throw new EmailInboundProviderError();
      return parseResendEmail(JSON.parse(await readLimitedBody(response, 2000000)), providerMessageId);
    } catch { throw new EmailInboundProviderError("No se pudo obtener el email de Resend."); }
  }
}
