import { createWhatsAppWebhookHandlers } from "@/lib/whatsapp/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createWhatsAppWebhookHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
