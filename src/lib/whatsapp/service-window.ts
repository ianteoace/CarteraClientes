export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WHATSAPP_TEXT_LIMIT = 4096;

export function getWhatsAppServiceWindow(lastInboundAt: Date | null, now: Date = new Date()) {
  const closesAt = lastInboundAt ? new Date(lastInboundAt.getTime() + WHATSAPP_SERVICE_WINDOW_MS) : null;
  return { open: Boolean(closesAt && now.getTime() < closesAt.getTime()), closesAt };
}

export function normalizeInboxReplyBody(value: string) {
  const body = value.trim();
  if (!body) throw new InboxReplyValidationError("Escribí un mensaje antes de enviarlo.");
  if ([...body].length > WHATSAPP_TEXT_LIMIT) {
    throw new InboxReplyValidationError(`El mensaje no puede superar ${WHATSAPP_TEXT_LIMIT} caracteres.`);
  }
  return body;
}

export class InboxReplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboxReplyValidationError";
  }
}
