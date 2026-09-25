-- Tables were audited as empty before this migration.
ALTER TABLE "Client" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Group" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Campaign" ADD COLUMN "ownerId" TEXT NOT NULL;

DROP INDEX "Client_phoneNormalized_key";

CREATE UNIQUE INDEX "Client_ownerId_phoneNormalized_key"
ON "Client"("ownerId", "phoneNormalized");

CREATE INDEX "Client_ownerId_idx" ON "Client"("ownerId");
CREATE INDEX "Group_ownerId_idx" ON "Group"("ownerId");
CREATE INDEX "Campaign_ownerId_idx" ON "Campaign"("ownerId");
