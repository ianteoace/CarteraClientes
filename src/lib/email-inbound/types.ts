export type EmailInboundEvent = {
  provider: "RESEND";
  eventKey: string;
  eventType: string;
  providerMessageId: string | null;
  toAddresses: string[];
};

export type InboundEmail = {
  providerMessageId: string;
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  attachmentCount: number;
  receivedAt: Date;
};

export interface EmailInboundProvider {
  verifyWebhook(rawBody: string, headers: Headers): EmailInboundEvent;
  retrieveEmail(providerMessageId: string): Promise<InboundEmail>;
}

export class EmailInboundConfigurationError extends Error {}
export class EmailInboundSignatureError extends Error {}
export class EmailInboundPayloadError extends Error {}
export class EmailInboundProviderError extends Error {}
