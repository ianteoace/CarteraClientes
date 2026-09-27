import "server-only";

import { getWhatsAppConfiguration, type WhatsAppConfiguration } from "@/lib/whatsapp/config";
import {
  formatPhoneForWhatsApp,
  type WhatsAppRecipientFormat,
} from "@/lib/whatsapp/phone";

type MetaErrorResponse = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
  };
};

type MetaSuccessResponse = {
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
};

export type WhatsAppSendResult = {
  messageId: string;
  to: string;
  waId?: string;
  httpStatus: number;
};

export class WhatsAppApiError extends Error {
  readonly httpStatus: number;
  readonly metaCode?: number;
  readonly metaSubcode?: number;

  constructor(message: string, options: { httpStatus: number; metaCode?: number; metaSubcode?: number }) {
    super(message);
    this.name = "WhatsAppApiError";
    this.httpStatus = options.httpStatus;
    this.metaCode = options.metaCode;
    this.metaSubcode = options.metaSubcode;
  }
}

export class WhatsAppInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppInputError";
  }
}

type TemplateParameter = string | number;
export type WhatsAppTemplateTextParameter = { type: "text"; text: string };
export type WhatsAppTemplateComponent = {
  type: "header" | "body";
  parameters: WhatsAppTemplateTextParameter[];
};

export type SendTemplateMessageInput = {
  to: string;
  recipientFormat?: WhatsAppRecipientFormat;
  templateName: string;
  languageCode: string;
  parameters?: TemplateParameter[];
  components?: WhatsAppTemplateComponent[];
};

export type SendTextMessageInput = {
  to: string;
  recipientFormat?: WhatsAppRecipientFormat;
  text: string;
};

async function parseResponse(response: Response): Promise<MetaErrorResponse & MetaSuccessResponse> {
  try {
    return (await response.json()) as MetaErrorResponse & MetaSuccessResponse;
  } catch {
    return {};
  }
}

function safeMetaMessage(message: string, accessToken: string) {
  return message
    .replaceAll(accessToken, "[REDACTADO]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTADO]")
    .slice(0, 500);
}

function normalizedComponents(input: SendTemplateMessageInput) {
  if (input.parameters?.length && input.components?.length) {
    throw new WhatsAppInputError("Usá parameters o components, no ambos a la vez.");
  }
  if (input.components?.length) {
    return input.components.map((component) => ({
      type: component.type,
      parameters: component.parameters.map((parameter) => {
        const text = parameter.text.trim();
        if (!text) throw new WhatsAppInputError("Los parámetros del template no pueden estar vacíos.");
        return { type: "text" as const, text };
      }),
    }));
  }
  return input.parameters?.length
    ? [{ type: "body" as const, parameters: input.parameters.map((parameter) => ({ type: "text" as const, text: String(parameter) })) }]
    : undefined;
}

export class WhatsAppCloudApiClient {
  constructor(
    private readonly configuration: WhatsAppConfiguration = getWhatsAppConfiguration(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async sendMessage(
    to: string,
    recipientFormat: WhatsAppRecipientFormat,
    payload: Record<string, unknown>,
  ): Promise<WhatsAppSendResult> {
    const formattedPhone = formatPhoneForWhatsApp(to, recipientFormat);
    const endpoint = `https://graph.facebook.com/${encodeURIComponent(this.configuration.apiVersion)}/${encodeURIComponent(this.configuration.phoneNumberId)}/messages`;
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.configuration.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: formattedPhone, ...payload }),
        cache: "no-store",
      });
    } catch {
      throw new WhatsAppApiError("No se pudo conectar con WhatsApp Cloud API.", { httpStatus: 0 });
    }

    const responseBody = await parseResponse(response);
    if (!response.ok) {
      const metaError = responseBody.error;
      const message = metaError?.error_data?.details ?? metaError?.message ?? "Meta rechazó la solicitud de WhatsApp.";
      throw new WhatsAppApiError(safeMetaMessage(message, this.configuration.accessToken), {
        httpStatus: response.status,
        metaCode: metaError?.code,
        metaSubcode: metaError?.error_subcode,
      });
    }

    const messageId = responseBody.messages?.[0]?.id;
    if (!messageId) throw new WhatsAppApiError("Meta aceptó la solicitud, pero no devolvió un identificador de mensaje.", { httpStatus: response.status });
    return { messageId, to: formattedPhone, waId: responseBody.contacts?.[0]?.wa_id, httpStatus: response.status };
  }

  async sendTemplateMessage(input: SendTemplateMessageInput) {
    const templateName = input.templateName.trim();
    const languageCode = input.languageCode.trim();
    if (!templateName || !languageCode) throw new WhatsAppInputError("El nombre del template y el idioma son obligatorios.");
    const components = normalizedComponents(input);
    return this.sendMessage(input.to, input.recipientFormat ?? "internal", {
      type: "template",
      template: { name: templateName, language: { code: languageCode }, ...(components ? { components } : {}) },
    });
  }

  async sendTextMessage(input: SendTextMessageInput) {
    const text = input.text.trim();
    if (!text) throw new WhatsAppInputError("El texto del mensaje es obligatorio.");
    return this.sendMessage(input.to, input.recipientFormat ?? "internal", {
      type: "text",
      text: { preview_url: false, body: text },
    });
  }
}

export function sendTemplateMessage(input: SendTemplateMessageInput) {
  return new WhatsAppCloudApiClient().sendTemplateMessage(input);
}

/** Los textos libres solo son válidos dentro de las reglas y ventana de servicio de WhatsApp. */
export function sendTextMessage(input: SendTextMessageInput) {
  return new WhatsAppCloudApiClient().sendTextMessage(input);
}
