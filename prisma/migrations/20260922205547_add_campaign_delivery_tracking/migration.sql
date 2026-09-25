-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'SENDING';
ALTER TYPE "CampaignStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "CampaignStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "CampaignStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecipientStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "RecipientStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "RecipientStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "RecipientStatus" ADD VALUE 'READ';
ALTER TYPE "RecipientStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");
