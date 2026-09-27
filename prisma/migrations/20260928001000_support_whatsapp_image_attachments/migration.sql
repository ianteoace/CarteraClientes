CREATE TABLE "WhatsAppMessageAttachment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "metaMediaId" TEXT,
  "mimeType" TEXT NOT NULL,
  "sha256" TEXT,
  "caption" TEXT,
  "storagePath" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processingToken" TEXT,
  "processingExpiresAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppMessageAttachment_messageId_metaMediaId_key" ON "WhatsAppMessageAttachment"("messageId", "metaMediaId");
CREATE INDEX "WhatsAppMessageAttachment_workspaceId_messageId_idx" ON "WhatsAppMessageAttachment"("workspaceId", "messageId");
ALTER TABLE "WhatsAppMessageAttachment" ADD CONSTRAINT "WhatsAppMessageAttachment_messageId_workspaceId_fkey"
  FOREIGN KEY ("messageId", "workspaceId") REFERENCES "WhatsAppMessage"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
