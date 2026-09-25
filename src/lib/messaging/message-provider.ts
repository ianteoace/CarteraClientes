export type SendMessageInput = {
  phone: string;
  message: string;
  recipientName: string;
};

export type SendMessageResult = {
  providerMessageId: string;
  acceptedAt: Date;
};

export interface MessageProvider {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
