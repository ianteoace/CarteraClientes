import { readLimitedBody } from "@/lib/email-inbound/content";
import { ResendEmailInboundProvider } from "@/lib/email-inbound/resend-provider";
import { processEmailInboundEvent } from "@/lib/email-inbound/service";
import { EmailInboundConfigurationError, EmailInboundSignatureError, type EmailInboundProvider } from "@/lib/email-inbound/types";

export function createEmailWebhookHandler(options: {
  provider?: EmailInboundProvider;
  processEvent?: typeof processEmailInboundEvent;
  logger?: Pick<Console, "info" | "error">;
} = {}) {
  return async function POST(request: Request) {
    const provider = options.provider ?? new ResendEmailInboundProvider();
    const logger = options.logger ?? console;
    let body: string;
    try { body = await readLimitedBody(request, 1000000); }
    catch { return Response.json({ error: "Payload demasiado grande." }, { status: 413 }); }
    let event;
    try { event = provider.verifyWebhook(body, request.headers); }
    catch (error) {
      if (error instanceof EmailInboundConfigurationError) return Response.json({ error: "Webhook de email no configurado." }, { status: 503 });
      return Response.json({ error: error instanceof EmailInboundSignatureError ? "Firma inválida." : "Evento inválido." }, { status: error instanceof EmailInboundSignatureError ? 401 : 400 });
    }
    try {
      const result = await (options.processEvent ?? processEmailInboundEvent)(event, provider);
      logger.info("Email webhook processed.", { eventType: event.eventType, duplicate: result.duplicate, handled: result.handled, messages: result.messages });
      return Response.json({ received: true }, { status: 200 });
    } catch {
      logger.error("Email webhook processing failed.");
      return Response.json({ error: "No se pudo procesar el email." }, { status: 500 });
    }
  };
}
