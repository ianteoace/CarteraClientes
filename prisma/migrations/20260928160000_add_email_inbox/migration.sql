-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "emailConnectionId" TEXT,
ADD COLUMN     "externalThreadId" TEXT,
ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "EmailConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "providerConnectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "emailConnectionId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" JSONB NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" JSONB NOT NULL,
    "ccAddresses" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "workspaceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailConnection_workspaceId_idx" ON "EmailConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_provider_address_key" ON "EmailConnection"("provider", "address");

-- CreateIndex
CREATE UNIQUE INDEX "EmailConnection_id_workspaceId_key" ON "EmailConnection"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "EmailMessage_workspaceId_fromAddress_idx" ON "EmailMessage"("workspaceId", "fromAddress");

-- CreateIndex
CREATE INDEX "EmailMessage_conversationId_receivedAt_id_idx" ON "EmailMessage"("conversationId", "receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_emailConnectionId_providerMessageId_key" ON "EmailMessage"("emailConnectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_emailConnectionId_internetMessageId_key" ON "EmailMessage"("emailConnectionId", "internetMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailWebhookEvent_eventKey_key" ON "EmailWebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_workspaceId_receivedAt_idx" ON "EmailWebhookEvent"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_provider_providerMessageId_idx" ON "EmailWebhookEvent"("provider", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_emailConnectionId_externalThreadId_key" ON "Conversation"("workspaceId", "emailConnectionId", "externalThreadId");


-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_emailConnectionId_workspaceId_fkey" FOREIGN KEY ("emailConnectionId", "workspaceId") REFERENCES "EmailConnection"("id", "workspaceId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConnection" ADD CONSTRAINT "EmailConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "Conversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_emailConnectionId_workspaceId_fkey" FOREIGN KEY ("emailConnectionId", "workspaceId") REFERENCES "EmailConnection"("id", "workspaceId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailWebhookEvent" ADD CONSTRAINT "EmailWebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
