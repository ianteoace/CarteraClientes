ALTER TYPE "WorkspacePermission" ADD VALUE 'INBOX_VIEW';
ALTER TYPE "WorkspacePermission" ADD VALUE 'INBOX_MANAGE';

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "clientId" TEXT,
  "whatsappConnectionId" TEXT NOT NULL,
  "externalParticipantId" TEXT NOT NULL,
  "externalDisplayName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationReadState" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WhatsAppMessage" ADD COLUMN "conversationId" TEXT;

CREATE UNIQUE INDEX "Conversation_workspaceId_whatsappConnectionId_externalParticipantId_key"
  ON "Conversation"("workspaceId", "whatsappConnectionId", "externalParticipantId");
CREATE INDEX "Conversation_workspaceId_lastMessageAt_id_idx" ON "Conversation"("workspaceId", "lastMessageAt", "id");
CREATE INDEX "Conversation_workspaceId_clientId_idx" ON "Conversation"("workspaceId", "clientId");
CREATE UNIQUE INDEX "ConversationReadState_conversationId_memberId_key" ON "ConversationReadState"("conversationId", "memberId");
CREATE INDEX "ConversationReadState_memberId_lastReadAt_idx" ON "ConversationReadState"("memberId", "lastReadAt");
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_id_idx" ON "WhatsAppMessage"("conversationId", "createdAt", "id");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_whatsappConnectionId_fkey"
  FOREIGN KEY ("whatsappConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
