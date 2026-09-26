ALTER TYPE "CampaignStatus" ADD VALUE 'SCHEDULED';

ALTER TABLE "Campaign"
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "scheduledTimezone" TEXT,
ADD COLUMN "scheduleGeneration" TEXT,
ADD COLUMN "scheduledByMemberId" TEXT,
ADD COLUMN "scheduledByUserId" TEXT;

ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_scheduledByMemberId_fkey"
FOREIGN KEY ("scheduledByMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Campaign_scheduledByMemberId_idx" ON "Campaign"("scheduledByMemberId");
CREATE INDEX "Campaign_workspaceId_status_scheduledAt_idx" ON "Campaign"("workspaceId", "status", "scheduledAt");
