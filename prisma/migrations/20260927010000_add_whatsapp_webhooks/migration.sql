CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT,
    "clientId" TEXT,
    "providerMessageId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "waId" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "textBody" TEXT,
    "profileName" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");
CREATE INDEX "WhatsAppConnection_workspaceId_idx" ON "WhatsAppConnection"("workspaceId");
CREATE INDEX "WhatsAppConnection_wabaId_idx" ON "WhatsAppConnection"("wabaId");

CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageId_key" ON "WhatsAppMessage"("providerMessageId");
CREATE INDEX "WhatsAppMessage_workspaceId_createdAt_idx" ON "WhatsAppMessage"("workspaceId", "createdAt");
CREATE INDEX "WhatsAppMessage_connectionId_createdAt_idx" ON "WhatsAppMessage"("connectionId", "createdAt");
CREATE INDEX "WhatsAppMessage_clientId_createdAt_idx" ON "WhatsAppMessage"("clientId", "createdAt");
CREATE INDEX "WhatsAppMessage_phoneNumberId_createdAt_idx" ON "WhatsAppMessage"("phoneNumberId", "createdAt");

CREATE UNIQUE INDEX "WhatsAppWebhookEvent_eventKey_key" ON "WhatsAppWebhookEvent"("eventKey");
CREATE INDEX "WhatsAppWebhookEvent_workspaceId_receivedAt_idx" ON "WhatsAppWebhookEvent"("workspaceId", "receivedAt");
CREATE INDEX "WhatsAppWebhookEvent_phoneNumberId_receivedAt_idx" ON "WhatsAppWebhookEvent"("phoneNumberId", "receivedAt");
CREATE INDEX "WhatsAppWebhookEvent_eventType_receivedAt_idx" ON "WhatsAppWebhookEvent"("eventType", "receivedAt");

ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
