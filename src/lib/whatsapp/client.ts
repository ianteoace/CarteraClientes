import "server-only";

import { normalizePhone } from "@/lib/phone";
import { getWhatsAppConfiguration } from "@/lib/whatsapp/config";

type MetaErrorResponse = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
  };
};

type MetaSuccessResponse = {
  messages?: Array<{ id?: string }>;
};

export type WhatsAppSendResult = {
  messageId: string;
  to: string;
};

export class WhatsAppApiError extends Error {
  readonly httpStatus: number;
  readonly metaCode?: number;
  readonly metaSubcode?: number;

  constructor(
    message: string,
    options: { httpStatus: number; metaCode?: number; metaSubcode?: number },
  ) {
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

export type SendTemplateMessageInput = {
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: TemplateParameter[];
};

export type SendTextMessageInput = {
  to: string;
  text: string;
};

async function parseResponse(response: Response): Promise<MetaErrorResponse & MetaSuccessResponse> {
  try {
    return (await response.json()) as MetaErrorResponse & MetaSuccessResponse;
  } catch {
    return {};
  }
}

async function sendMessage(to: string, payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizePhone(to);
  const configuration = getWhatsAppConfiguration();
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(configuration.apiVersion)}/${encodeURIComponent(configuration.phoneNumberId)}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      ...payload,
    }),
    cache: "no-store",
  });
  const responseBody = await parseResponse(response);

  if (!response.ok) {
    const metaError = responseBody.error;
    const detail = metaError?.error_data?.details;
    const message = detail ?? metaError?.message ?? "Meta rechazó la solicitud de WhatsApp.";
    const safeMessage = message.replaceAll(configuration.accessToken, "[REDACTADO]");

    throw new WhatsAppApiError(safeMessage, {
      httpStatus: response.status,
      metaCode: metaError?.code,
      metaSubcode: metaError?.error_subcode,
    });
  }

  const messageId = responseBody.messages?.[0]?.id;

  if (!messageId) {
    throw new WhatsAppApiError("Meta aceptó la solicitud, pero no devolvió un identificador de mensaje.", {
      httpStatus: response.status,
    });
  }

  return { messageId, to: normalizedPhone };
}

export async function sendTemplateMessage(input: SendTemplateMessageInput) {
  const templateName = input.templateName.trim();
  const languageCode = input.languageCode.trim();

  if (!templateName || !languageCode) {
    throw new WhatsAppInputError("El nombre del template y el idioma son obligatorios.");
  }

  const components = input.parameters?.length
    ? [
        {
          type: "body",
          parameters: input.parameters.map((parameter) => ({
            type: "text",
            text: String(parameter),
          })),
        },
      ]
    : undefined;

  return sendMessage(input.to, {
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/**
 * Los textos libres están sujetos a las reglas y a la ventana de conversación
 * de WhatsApp. Los mensajes iniciados por la empresa deben usar templates
 * aprobados cuando las políticas de Meta así lo requieran.
 */
export async function sendTextMessage(input: SendTextMessageInput) {
  const text = input.text.trim();

  if (!text) {
    throw new WhatsAppInputError("El texto del mensaje es obligatorio.");
  }

  return sendMessage(input.to, {
    type: "text",
    text: { preview_url: false, body: text },
  });
}
