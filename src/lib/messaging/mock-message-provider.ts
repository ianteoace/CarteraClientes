import { randomUUID } from "node:crypto";

import type {
  MessageProvider,
  SendMessageInput,
  SendMessageResult,
} from "@/lib/messaging/message-provider";

type MockMessageProviderOptions = {
  shouldFail?: (input: SendMessageInput) => boolean;
  onSend?: (input: SendMessageInput) => void | Promise<void>;
};

export class MockMessageProvider implements MessageProvider {
  constructor(private readonly options: MockMessageProviderOptions = {}) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    await this.options.onSend?.(input);

    if (this.options.shouldFail?.(input)) {
      throw new Error("Fallo simulado del proveedor.");
    }

    return {
      providerMessageId: `mock_${randomUUID()}`,
      acceptedAt: new Date(),
    };
  }
}
