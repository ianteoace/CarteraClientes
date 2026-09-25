import "server-only";

const REQUIRED_VARIABLES = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_API_VERSION",
] as const;

type WhatsAppVariable = (typeof REQUIRED_VARIABLES)[number];

export type WhatsAppConfigurationStatus = Record<WhatsAppVariable, boolean>;

export class WhatsAppConfigurationError extends Error {
  readonly missingVariables: WhatsAppVariable[];

  constructor(missingVariables: WhatsAppVariable[]) {
    super(`Faltan variables de configuración de WhatsApp: ${missingVariables.join(", ")}.`);
    this.name = "WhatsAppConfigurationError";
    this.missingVariables = missingVariables;
  }
}

export function getWhatsAppConfigurationStatus(): WhatsAppConfigurationStatus {
  return {
    WHATSAPP_ACCESS_TOKEN: Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    WHATSAPP_API_VERSION: Boolean(process.env.WHATSAPP_API_VERSION?.trim()),
  };
}

export function getWhatsAppConfiguration() {
  const status = getWhatsAppConfigurationStatus();
  const missingVariables = REQUIRED_VARIABLES.filter((variable) => !status[variable]);

  if (missingVariables.length > 0) {
    throw new WhatsAppConfigurationError(missingVariables);
  }

  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!.trim(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!.trim(),
    apiVersion: process.env.WHATSAPP_API_VERSION!.trim(),
  };
}
