import { createHash } from "node:crypto";
import { isWhatsAppImageMime } from "@/lib/whatsapp/image-media";

export const WHATSAPP_MESSAGE_DIRECTION = {
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND",
} as const;

export const WHATSAPP_MESSAGE_TYPE = {
  TEXT: "TEXT",
  TEMPLATE: "TEMPLATE",
  IMAGE: "IMAGE",
  UNSUPPORTED: "UNSUPPORTED",
} as const;

export const WHATSAPP_MESSAGE_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  READ: "READ",
  FAILED: "FAILED",
} as const;

export type WhatsAppMessageStatus =
  (typeof WHATSAPP_MESSAGE_STATUS)[keyof typeof WHATSAPP_MESSAGE_STATUS];

type EventBase = {
  eventKey: string;
  eventType: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  payload: Record<string, unknown>;
};

export type WhatsAppStatusEvent = EventBase & {
  kind: "status";
  providerMessageId: string;
  clientRequestId: string | null;
  status: WhatsAppMessageStatus;
  occurredAt: Date | null;
  waId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type WhatsAppIncomingMessageEvent = EventBase & {
  kind: "message";
  providerMessageId: string;
  from: string;
  messageType: "TEXT" | "IMAGE" | "UNSUPPORTED";
  image: { mediaId: string; mimeType: string; sha256: string | null; caption: string | null } | null;
  textBody: string | null;
  profileName: string | null;
  occurredAt: Date | null;
};

export type WhatsAppUnsupportedEvent = EventBase & {
  kind: "unsupported";
};

export type ParsedWhatsAppEvent =
  | WhatsAppStatusEvent
  | WhatsAppIncomingMessageEvent
  | WhatsAppUnsupportedEvent;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeText(value: unknown, maximumLength: number) {
  return asString(value)?.slice(0, maximumLength) ?? null;
}

function safeScalarText(value: unknown, maximumLength: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, maximumLength);
  }
  return safeText(value, maximumLength);
}

export function parseWhatsAppTimestamp(value: unknown) {
  const timestamp = asString(value);
  if (!timestamp || !/^\d{1,15}$/.test(timestamp)) return null;
  const milliseconds = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapStatus(value: unknown): WhatsAppMessageStatus | null {
  switch (asString(value)?.toLowerCase()) {
    case "sent": return WHATSAPP_MESSAGE_STATUS.SENT;
    case "delivered": return WHATSAPP_MESSAGE_STATUS.DELIVERED;
    case "read": return WHATSAPP_MESSAGE_STATUS.READ;
    case "failed": return WHATSAPP_MESSAGE_STATUS.FAILED;
    default: return null;
  }
}

function getProfileName(value: UnknownRecord, from: string) {
  for (const contactValue of asArray(value.contacts)) {
    const contact = asRecord(contactValue);
    if (!contact || asString(contact.wa_id) !== from) continue;
    return safeText(asRecord(contact.profile)?.name, 255);
  }
  return null;
}

function statusFailure(status: UnknownRecord) {
  const firstError = asRecord(asArray(status.errors)[0]);
  if (!firstError) return { failureCode: null, failureMessage: null };
  const errorData = asRecord(firstError.error_data);
  return {
    failureCode: safeScalarText(firstError.code, 100),
    failureMessage: (
      safeText(errorData?.details, 500)
      ?? safeText(firstError.title, 500)
      ?? safeText(firstError.message, 500)
    ),
  };
}

function unsupportedEvent(
  wabaId: string | null,
  phoneNumberId: string | null,
  field: string | null,
  value: UnknownRecord,
): WhatsAppUnsupportedEvent {
  const payload = { field, phoneNumberId, wabaId };
  const hash = createHash("sha256").update(JSON.stringify({ payload, value })).digest("hex");
  return {
    kind: "unsupported",
    eventKey: `unsupported:${hash}`,
    eventType: field ? `unsupported.${field}` : "unsupported",
    wabaId,
    phoneNumberId,
    payload,
  };
}

export function parseWhatsAppWebhookPayload(payload: unknown): ParsedWhatsAppEvent[] {
  const root = asRecord(payload);
  if (!root) return [];
  const parsedEvents: ParsedWhatsAppEvent[] = [];

  for (const entryValue of asArray(root.entry)) {
    const entry = asRecord(entryValue);
    if (!entry) continue;
    const wabaId = asString(entry.id);

    for (const changeValue of asArray(entry.changes)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      if (!change || !value) continue;
      const field = asString(change.field);
      const metadata = asRecord(value.metadata);
      const phoneNumberId = asString(metadata?.phone_number_id);
      let recognizedItems = 0;

      for (const statusValue of asArray(value.statuses)) {
        const status = asRecord(statusValue);
        const providerMessageId = asString(status?.id);
        const mappedStatus = mapStatus(status?.status);
        if (!status || !providerMessageId || !mappedStatus) continue;
        recognizedItems += 1;
        const timestamp = asString(status.timestamp);
        const failure = statusFailure(status);
        const opaqueRequestId = asString(status.biz_opaque_callback_data);
        const clientRequestId = opaqueRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(opaqueRequestId)
          ? opaqueRequestId : null;
        parsedEvents.push({
          kind: "status",
          eventKey: `status:${providerMessageId}:${mappedStatus}:${timestamp ?? "unknown"}`,
          eventType: `status.${mappedStatus.toLowerCase()}`,
          wabaId,
          phoneNumberId,
          providerMessageId,
          clientRequestId,
          status: mappedStatus,
          occurredAt: parseWhatsAppTimestamp(timestamp),
          waId: asString(status.recipient_id),
          ...failure,
          payload: {
            providerMessageId,
            clientRequestId,
            status: mappedStatus,
            timestamp,
            waId: asString(status.recipient_id),
            phoneNumberId,
            wabaId,
            ...failure,
          },
        });
      }

      for (const messageValue of asArray(value.messages)) {
        const message = asRecord(messageValue);
        const providerMessageId = asString(message?.id);
        const from = asString(message?.from);
        if (!message || !providerMessageId || !from) continue;
        recognizedItems += 1;
        const rawType = asString(message.type)?.toLowerCase();
        const rawImage = rawType === "image" ? asRecord(message.image) : null;
        const mediaId = asString(rawImage?.id);
        const mimeType = asString(rawImage?.mime_type)?.toLowerCase();
        const image = mediaId && /^\d{1,100}$/.test(mediaId) && mimeType && isWhatsAppImageMime(mimeType)
          ? { mediaId, mimeType, sha256: safeText(rawImage?.sha256, 100), caption: safeText(rawImage?.caption, 2000) } : null;
        const messageType = rawType === "text" ? "TEXT" : image ? "IMAGE" : "UNSUPPORTED";
        const textBody = messageType === "TEXT"
          ? safeText(asRecord(message.text)?.body, 32_000)
          : null;
        const timestamp = asString(message.timestamp);
        const profileName = getProfileName(value, from);
        parsedEvents.push({
          kind: "message",
          eventKey: `message:${providerMessageId}`,
          eventType: `message.${rawType ?? "unsupported"}`,
          wabaId,
          phoneNumberId,
          providerMessageId,
          from,
          messageType,
          image,
          textBody,
          profileName,
          occurredAt: parseWhatsAppTimestamp(timestamp),
          payload: {
            providerMessageId,
            from,
            timestamp,
            messageType,
            ...(image ? { image } : {}),
            textBody,
            profileName,
            phoneNumberId,
            wabaId,
          },
        });
      }

      if (recognizedItems === 0) {
        parsedEvents.push(unsupportedEvent(wabaId, phoneNumberId, field, value));
      }
    }
  }

  return parsedEvents;
}
