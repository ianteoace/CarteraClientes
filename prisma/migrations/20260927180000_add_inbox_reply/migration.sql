ALTER TYPE "WorkspacePermission" ADD VALUE 'INBOX_REPLY';

ALTER TABLE "WhatsAppMessage"
  ALTER COLUMN "providerMessageId" DROP NOT NULL,
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "sentByMemberId" TEXT,
  ADD COLUMN "sentByUserId" TEXT;

CREATE UNIQUE INDEX "WhatsAppMessage_workspaceId_clientRequestId_key"
  ON "WhatsAppMessage"("workspaceId", "clientRequestId");
CREATE INDEX "WhatsAppMessage_sentByMemberId_idx"
  ON "WhatsAppMessage"("sentByMemberId");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sentByMemberId_fkey"
  FOREIGN KEY ("sentByMemberId") REFERENCES "WorkspaceMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
