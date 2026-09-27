import "server-only";

const WEBHOOK_VARIABLES = ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET"] as const;
type WebhookVariable = (typeof WEBHOOK_VARIABLES)[number];

export type WhatsAppWebhookConfiguration = {
  verifyToken: string;
  appSecret: string;
};

export class WhatsAppWebhookConfigurationError extends Error {
  readonly missingVariables: WebhookVariable[];

  constructor(missingVariables: WebhookVariable[]) {
    super(`Configuración de webhook de WhatsApp incompleta: faltan ${missingVariables.join(", ")}.`);
    this.name = "WhatsAppWebhookConfigurationError";
    this.missingVariables = missingVariables;
  }
}

export function getWhatsAppWebhookConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): WhatsAppWebhookConfiguration {
  const missingVariables = WEBHOOK_VARIABLES.filter(
    (variable) => !environment[variable]?.trim(),
  );

  if (missingVariables.length) {
    throw new WhatsAppWebhookConfigurationError(missingVariables);
  }

  return {
    verifyToken: environment.WHATSAPP_WEBHOOK_VERIFY_TOKEN!.trim(),
    appSecret: environment.META_APP_SECRET!.trim(),
  };
}
