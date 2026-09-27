import "server-only";

const REQUIRED_VARIABLES = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_API_VERSION",
] as const;

type WhatsAppVariable = (typeof REQUIRED_VARIABLES)[number];

export type WhatsAppConfigurationStatus = Record<WhatsAppVariable, boolean>;

export type WhatsAppConfiguration = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  apiVersion: string;
};

export class WhatsAppConfigurationError extends Error {
  readonly missingVariables: WhatsAppVariable[];
  readonly invalidVariables: WhatsAppVariable[];

  constructor(missingVariables: WhatsAppVariable[], invalidVariables: WhatsAppVariable[] = []) {
    const details = [
      missingVariables.length ? `faltan ${missingVariables.join(", ")}` : "",
      invalidVariables.length ? `son inválidas ${invalidVariables.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    super(`Configuración de WhatsApp incompleta: ${details}.`);
    this.name = "WhatsAppConfigurationError";
    this.missingVariables = missingVariables;
    this.invalidVariables = invalidVariables;
  }
}

export function getWhatsAppConfigurationStatus(environment: NodeJS.ProcessEnv = process.env): WhatsAppConfigurationStatus {
  return {
    WHATSAPP_ACCESS_TOKEN: Boolean(environment.WHATSAPP_ACCESS_TOKEN?.trim()),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(environment.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    WHATSAPP_WABA_ID: Boolean(environment.WHATSAPP_WABA_ID?.trim()),
    WHATSAPP_API_VERSION: Boolean(environment.WHATSAPP_API_VERSION?.trim()),
  };
}

export function getWhatsAppConfiguration(environment: NodeJS.ProcessEnv = process.env): WhatsAppConfiguration {
  const status = getWhatsAppConfigurationStatus(environment);
  const missingVariables = REQUIRED_VARIABLES.filter((variable) => !status[variable]);
  const apiVersion = environment.WHATSAPP_API_VERSION?.trim() ?? "";
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  const wabaId = environment.WHATSAPP_WABA_ID?.trim() ?? "";
  const invalidVariables = [
    ...(!missingVariables.includes("WHATSAPP_API_VERSION") && !/^v\d{1,3}\.\d{1,2}$/.test(apiVersion) ? ["WHATSAPP_API_VERSION" as const] : []),
    ...(!missingVariables.includes("WHATSAPP_PHONE_NUMBER_ID") && !/^\d+$/.test(phoneNumberId) ? ["WHATSAPP_PHONE_NUMBER_ID" as const] : []),
    ...(!missingVariables.includes("WHATSAPP_WABA_ID") && !/^\d+$/.test(wabaId) ? ["WHATSAPP_WABA_ID" as const] : []),
  ];

  if (missingVariables.length > 0 || invalidVariables.length > 0) {
    throw new WhatsAppConfigurationError(missingVariables, invalidVariables);
  }

  return {
    accessToken: environment.WHATSAPP_ACCESS_TOKEN!.trim(),
    phoneNumberId,
    wabaId,
    apiVersion,
  };
}
