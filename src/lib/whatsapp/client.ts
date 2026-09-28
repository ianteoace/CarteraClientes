import "server-only";
import type { MetaTemplate } from "@/lib/campaign-delivery";

import { isWhatsAppImageMime, MAX_WHATSAPP_IMAGE_BYTES, verifyWhatsAppImage, WhatsAppMediaError } from "@/lib/whatsapp/image-media";

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
  clientRequestId?: string;
  signal?: AbortSignal;
};

export type SendTextMessageInput = {
  to: string;
  recipientFormat?: WhatsAppRecipientFormat;
  text: string;
  clientRequestId?: string;
  signal?: AbortSignal;
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

  /** Server-only catalog. Pagination uses only opaque cursors, never remote next URLs. */
  async listTemplates(name?: string): Promise<MetaTemplate[]> {
    if (name && !/^[a-z0-9_]{1,512}$/.test(name)) throw new WhatsAppInputError("La plantilla no es válida.");
    const templates: MetaTemplate[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://graph.facebook.com/${this.configuration.apiVersion}/${this.configuration.wabaId}/message_templates`);
      url.searchParams.set("fields", "id,name,language,category,status,components,parameter_format");
      url.searchParams.set("limit", "100");
      if (name) url.searchParams.set("name", name);
      if (after) url.searchParams.set("after", after);
      let response: Response;
      try {
        response = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.configuration.accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
      } catch { throw new WhatsAppApiError("No se pudieron consultar las plantillas de WhatsApp.", { httpStatus: 0 }); }
      const data = await response.json().catch(() => null) as (MetaErrorResponse & { data?: MetaTemplate[]; paging?: { next?: string; cursors?: { after?: string } } }) | null;
      if (!response.ok) throw new WhatsAppApiError(safeMetaMessage(data?.error?.message ?? "Meta rechazó la consulta de plantillas.", this.configuration.accessToken), { httpStatus: response.status, metaCode: data?.error?.code, metaSubcode: data?.error?.error_subcode });
      if (!Array.isArray(data?.data)) throw new WhatsAppApiError("Meta devolvió un catálogo de plantillas inválido.", { httpStatus: response.status });
      templates.push(...data.data);
      if (!data.paging?.next) return templates;
      after = data.paging.cursors?.after;
      if (!after || cursors.has(after) || after.length > 4096) break;
      cursors.add(after);
    }
    throw new WhatsAppInputError("El catálogo de plantillas es demasiado grande o está incompleto. Intentá actualizarlo.");
  }

  async retrieveImage(mediaId: string, phoneNumberId: string, expected: { mimeType: string; sha256?: string | null }) {
    if (!/^\d{1,100}$/.test(mediaId) || !/^\d+$/.test(phoneNumberId) || !isWhatsAppImageMime(expected.mimeType)) {
      throw new WhatsAppMediaError("INVALID_MEDIA");
    }
    const signal = AbortSignal.timeout(25_000);
    let metadataResponse: Response;
    try {
      metadataResponse = await this.fetcher(`https://graph.facebook.com/${encodeURIComponent(this.configuration.apiVersion)}/${mediaId}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, {
        headers: { Authorization: `Bearer ${this.configuration.accessToken}` }, cache: "no-store", redirect: "error", signal,
      });
    } catch { throw new WhatsAppMediaError("RETRIEVE_FAILED", true); }
    if (!metadataResponse.ok) throw new WhatsAppMediaError("RETRIEVE_FAILED", true);
    const metadata = await metadataResponse.json().catch(() => null) as { id?: string; url?: string; mime_type?: string; file_size?: number; sha256?: string } | null;
    if (!metadata || metadata.id !== mediaId || metadata.mime_type !== expected.mimeType || typeof metadata.url !== "string" ||
      !Number.isSafeInteger(metadata.file_size) || metadata.file_size! <= 0 || metadata.file_size! > MAX_WHATSAPP_IMAGE_BYTES) throw new WhatsAppMediaError("INVALID_MEDIA");
    let url: URL;
    try { url = new URL(metadata.url); } catch { throw new WhatsAppMediaError("INVALID_MEDIA_URL"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "lookaside.fbsbx.com" || url.hostname.endsWith(".fbcdn.net"))) throw new WhatsAppMediaError("INVALID_MEDIA_URL");
    let download: Response;
    try {
      download = await this.fetcher(url.toString(), { headers: { Authorization: `Bearer ${this.configuration.accessToken}` }, cache: "no-store", redirect: "error", signal });
    } catch { throw new WhatsAppMediaError("DOWNLOAD_FAILED", true); }
    if (!download.ok || !download.body) throw new WhatsAppMediaError("DOWNLOAD_FAILED", true);
    if (download.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== expected.mimeType) throw new WhatsAppMediaError("INVALID_MIME");
    const contentLength = Number(download.headers.get("content-length"));
    if (contentLength > MAX_WHATSAPP_IMAGE_BYTES) throw new WhatsAppMediaError("INVALID_SIZE");
    const reader = download.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_WHATSAPP_IMAGE_BYTES) { await reader.cancel(); throw new WhatsAppMediaError("INVALID_SIZE"); }
        chunks.push(value);
      }
    } catch (error) { if (error instanceof WhatsAppMediaError) throw error; throw new WhatsAppMediaError("DOWNLOAD_FAILED", true); }
    if (size !== metadata.file_size) throw new WhatsAppMediaError("INVALID_SIZE");
    const bytes = Buffer.concat(chunks, size);
    const sha256 = verifyWhatsAppImage(bytes, expected.mimeType, [expected.sha256, metadata.sha256]);
    return { bytes, mimeType: expected.mimeType, sizeBytes: size, sha256 };
  }

  private async sendMessage(
    to: string,
    recipientFormat: WhatsAppRecipientFormat,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
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
        signal,
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
      ...(input.clientRequestId ? { biz_opaque_callback_data: input.clientRequestId } : {}),
    }, input.signal);
  }

  async sendTextMessage(input: SendTextMessageInput) {
    const text = input.text.trim();
    if (!text) throw new WhatsAppInputError("El texto del mensaje es obligatorio.");
    return this.sendMessage(input.to, input.recipientFormat ?? "internal", {
      type: "text",
      text: { preview_url: false, body: text },
      ...(input.clientRequestId ? { biz_opaque_callback_data: input.clientRequestId } : {}),
    }, input.signal);
  }
}

export function sendTemplateMessage(input: SendTemplateMessageInput) {
  return new WhatsAppCloudApiClient().sendTemplateMessage(input);
}

/** Los textos libres solo son válidos dentro de las reglas y ventana de servicio de WhatsApp. */
export function sendTextMessage(input: SendTextMessageInput) {
  return new WhatsAppCloudApiClient().sendTextMessage(input);
}
