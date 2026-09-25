import "server-only";

import type { MessageProvider } from "@/lib/messaging/message-provider";
import { MockMessageProvider } from "@/lib/messaging/mock-message-provider";

export class MessageProviderConfigurationError extends Error {
  constructor(provider: string) {
    super(`Proveedor de mensajes no soportado: ${provider}. Configurá MESSAGE_PROVIDER="mock".`);
    this.name = "MessageProviderConfigurationError";
  }
}

export function getMessageProvider(): MessageProvider {
  const provider = process.env.MESSAGE_PROVIDER?.trim() || "mock";

  if (provider === "mock") {
    return new MockMessageProvider();
  }

  throw new MessageProviderConfigurationError(provider);
}
