import { persistWhatsAppWebhookEvent, type WhatsAppWebhookProcessResult } from "@/lib/whatsapp/webhook-repository";
import { parseWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-types";

export type WhatsAppWebhookPersister = (
  event: ReturnType<typeof parseWhatsAppWebhookPayload>[number],
  receivedAt: Date,
) => Promise<WhatsAppWebhookProcessResult>;

export async function processWhatsAppWebhookPayload(
  payload: unknown,
  options: {
    receivedAt?: Date;
    persist?: WhatsAppWebhookPersister;
  } = {},
) {
  const receivedAt = options.receivedAt ?? new Date();
  const persist = options.persist ?? persistWhatsAppWebhookEvent;
  const events = parseWhatsAppWebhookPayload(payload);
  const results: WhatsAppWebhookProcessResult[] = [];

  for (const event of events) {
    results.push(await persist(event, receivedAt));
  }

  return results;
}
