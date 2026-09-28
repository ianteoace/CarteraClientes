import { createEmailWebhookHandler } from "@/lib/email-inbound/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = createEmailWebhookHandler();
