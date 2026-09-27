import { persistWhatsAppWebhookEvent, type WhatsAppWebhookProcessResult } from "@/lib/whatsapp/webhook-repository";
import { parseWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-types";
import { processInboundImage } from "@/lib/whatsapp/image-attachment-service";

export type WhatsAppWebhookPersister = (
  event: ReturnType<typeof parseWhatsAppWebhookPayload>[number],
  receivedAt: Date,
) => Promise<WhatsAppWebhookProcessResult>;

export async function processWhatsAppWebhookPayload(
  payload: unknown,
  options: {
    receivedAt?: Date;
    persist?: WhatsAppWebhookPersister;
    processImage?: typeof processInboundImage;
  } = {},
) {
  const receivedAt = options.receivedAt ?? new Date();
  const persist = options.persist ?? persistWhatsAppWebhookEvent;
  const events = parseWhatsAppWebhookPayload(payload);
  const results: WhatsAppWebhookProcessResult[] = [];

  for (const event of events) {
    results.push(await persist(event, receivedAt));
    // DB persistence has committed. No transaction is held during network/storage IO.
    // This runs for duplicate events too, so FAILED/expired PROCESSING media can resume.
    if (event.kind === "message" && event.messageType === "IMAGE" && event.phoneNumberId) {
      await (options.processImage ?? processInboundImage)(event.providerMessageId, event.phoneNumberId);
    }
  }

  return results;
}
