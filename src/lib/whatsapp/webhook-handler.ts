import { getWhatsAppWebhookConfiguration } from "@/lib/whatsapp/webhook-config";
import { processWhatsAppWebhookPayload } from "@/lib/whatsapp/webhook-service";
import { verifyWhatsAppWebhookSignature } from "@/lib/whatsapp/webhook-signature";

type WebhookProcessor = typeof processWhatsAppWebhookPayload;

function maskIdentifier(value: string | null) {
  if (!value) return null;
  return value.length <= 6 ? "***" : `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function abbreviatedMessageId(value: string | null) {
  if (!value) return null;
  return `${value.slice(0, 10)}…`;
}

export function createWhatsAppWebhookHandlers(options: {
  environment?: NodeJS.ProcessEnv;
  processPayload?: WebhookProcessor;
  logger?: Pick<Console, "info" | "error">;
} = {}) {
  const environment = options.environment ?? process.env;
  const processPayload = options.processPayload ?? processWhatsAppWebhookPayload;
  const logger = options.logger ?? console;

  async function GET(request: Request) {
    let configuration;
    try {
      configuration = getWhatsAppWebhookConfiguration(environment);
    } catch {
      logger.error("WhatsApp webhook configuration is incomplete.");
      return new Response("Webhook no configurado.", { status: 500 });
    }

    const searchParams = new URL(request.url).searchParams;
    const mode = searchParams.get("hub.mode");
    const verifyToken = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode !== "subscribe" || verifyToken !== configuration.verifyToken || challenge === null) {
      return new Response("Forbidden", { status: 403 });
    }

    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  async function POST(request: Request) {
    let configuration;
    try {
      configuration = getWhatsAppWebhookConfiguration(environment);
    } catch {
      logger.error("WhatsApp webhook configuration is incomplete.");
      return Response.json({ error: "Webhook no configurado." }, { status: 500 });
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifyWhatsAppWebhookSignature(rawBody, signature, configuration.appSecret)) {
      return Response.json({ error: "Firma inválida." }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return Response.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    try {
      const results = await processPayload(payload);
      for (const result of results) {
        logger.info("WhatsApp webhook processed.", {
          eventType: result.eventType,
          phoneNumberId: maskIdentifier(result.phoneNumberId),
          providerMessageId: abbreviatedMessageId(result.providerMessageId),
          duplicate: result.duplicate,
          handled: result.handled,
        });
      }
      return Response.json({ received: true }, { status: 200 });
    } catch {
      logger.error("WhatsApp webhook persistence failed.");
      return Response.json({ error: "No se pudo persistir el webhook." }, { status: 500 });
    }
  }

  return { GET, POST };
}
