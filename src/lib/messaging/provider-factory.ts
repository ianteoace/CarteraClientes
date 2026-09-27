import "server-only";

import type { MessageProvider } from "@/lib/messaging/message-provider";
import { MetaWhatsAppProvider } from "@/lib/messaging/meta-whatsapp-provider";
import { MockMessageProvider } from "@/lib/messaging/mock-message-provider";
import { WhatsAppCloudApiClient } from "@/lib/whatsapp/client";
import { getWhatsAppConfiguration } from "@/lib/whatsapp/config";

export class MessageProviderConfigurationError extends Error {
  constructor(provider: string) {
    super(`Proveedor de mensajes no soportado: ${provider}. Configurá MESSAGE_PROVIDER="mock" o "meta".`);
    this.name = "MessageProviderConfigurationError";
  }
}

export function getMessageProvider(environment: NodeJS.ProcessEnv = process.env): MessageProvider {
  const provider = environment.MESSAGE_PROVIDER?.trim() || "mock";
  if (provider === "mock") return new MockMessageProvider();
  if (provider === "meta") return new MetaWhatsAppProvider(new WhatsAppCloudApiClient(getWhatsAppConfiguration(environment)));
  throw new MessageProviderConfigurationError(provider);
}
