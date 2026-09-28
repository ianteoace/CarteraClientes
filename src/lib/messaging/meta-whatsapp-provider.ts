import "server-only";

import type { MessageProvider, SendMessageResult } from "@/lib/messaging/message-provider";
import {
  WhatsAppCloudApiClient,
  type SendTemplateMessageInput,
  type SendTextMessageInput,
  type WhatsAppSendResult,
} from "@/lib/whatsapp/client";

export class MetaCampaignTemplateRequiredError extends Error {
  constructor() {
    super("Meta no admite campañas de texto libre. Usá una plantilla aprobada para WhatsApp real o el proveedor mock para simular.");
    this.name = "MetaCampaignTemplateRequiredError";
  }
}

export type MetaProviderSendResult = SendMessageResult & Pick<WhatsAppSendResult, "httpStatus" | "to" | "waId">;

export class MetaWhatsAppProvider implements MessageProvider {
  readonly supportsFreeformCampaigns = false;

  constructor(
    private readonly client: WhatsAppCloudApiClient = new WhatsAppCloudApiClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sendMessage(): Promise<SendMessageResult> {
    throw new MetaCampaignTemplateRequiredError();
  }

  async sendTemplateMessage(input: Omit<SendTemplateMessageInput, "to"> & { phone: string }): Promise<MetaProviderSendResult> {
    const result = await this.client.sendTemplateMessage({ ...input, to: input.phone });
    return { providerMessageId: result.messageId, acceptedAt: this.now(), httpStatus: result.httpStatus, to: result.to, waId: result.waId };
  }

  async sendTextMessage(input: Omit<SendTextMessageInput, "to"> & { phone: string }): Promise<MetaProviderSendResult> {
    const result = await this.client.sendTextMessage({ ...input, to: input.phone });
    return { providerMessageId: result.messageId, acceptedAt: this.now(), httpStatus: result.httpStatus, to: result.to, waId: result.waId };
  }
}
