-- Additive migration: existing campaigns remain simulations. No recipient reset.
ALTER TYPE "RecipientStatus" ADD VALUE 'UNKNOWN';
ALTER TABLE "Campaign" ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_deliveryMode_check" CHECK ("deliveryMode" IN ('MOCK', 'META_WHATSAPP'));
ALTER TABLE "CampaignRecipient"
  ADD COLUMN "dispatchAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "templateParameters" JSONB;
-- Preserve the dispatch result independently of later delivery webhooks.
UPDATE "CampaignRecipient" SET "dispatchAcceptedAt" = COALESCE("sentAt", "createdAt")
  WHERE "status"::text IN ('ACCEPTED', 'DELIVERED', 'READ');
ALTER TABLE "WhatsAppMessage" ADD COLUMN "campaignRecipientId" TEXT;
CREATE TABLE "CampaignWhatsAppTemplate" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "whatsappConnectionId" TEXT,
  "metaTemplateId" TEXT,
  "templateName" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "componentsSnapshot" JSONB NOT NULL,
  "parameterMapping" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignWhatsAppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignWhatsAppTemplate_campaignId_key" ON "CampaignWhatsAppTemplate"("campaignId");
CREATE INDEX "CampaignWhatsAppTemplate_whatsappConnectionId_idx" ON "CampaignWhatsAppTemplate"("whatsappConnectionId");
CREATE UNIQUE INDEX "WhatsAppMessage_campaignRecipientId_key" ON "WhatsAppMessage"("campaignRecipientId");
CREATE INDEX "CampaignRecipient_providerMessageId_idx" ON "CampaignRecipient"("providerMessageId");
CREATE INDEX "WhatsAppMessage_workspaceId_connectionId_waId_idx" ON "WhatsAppMessage"("workspaceId", "connectionId", "waId");
ALTER TABLE "CampaignWhatsAppTemplate" ADD CONSTRAINT "CampaignWhatsAppTemplate_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignWhatsAppTemplate" ADD CONSTRAINT "CampaignWhatsAppTemplate_whatsappConnectionId_fkey"
  FOREIGN KEY ("whatsappConnectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_campaignRecipientId_fkey"
  FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
