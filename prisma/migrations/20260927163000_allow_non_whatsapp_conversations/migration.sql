ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_whatsappConnectionId_fkey";
ALTER TABLE "Conversation" ALTER COLUMN "whatsappConnectionId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_whatsappConnectionId_fkey"
  FOREIGN KEY ("whatsappConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
