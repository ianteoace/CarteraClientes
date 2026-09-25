-- Create the workspace ownership model before moving existing business data.
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'AGENT', 'VIEWER');

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every legacy owner becomes exactly one workspace. Existing settings provide its display data.
WITH owners AS (
    SELECT "ownerId" FROM "Client"
    UNION SELECT "ownerId" FROM "Group"
    UNION SELECT "ownerId" FROM "Campaign"
    UNION SELECT "ownerId" FROM "AccountSettings"
)
INSERT INTO "Workspace" ("id", "name", "description", "createdAt", "updatedAt")
SELECT
    'ws_' || md5(owners."ownerId"),
    COALESCE(settings."name", 'Mi cartera'),
    settings."description",
    COALESCE(settings."createdAt", CURRENT_TIMESTAMP),
    COALESCE(settings."updatedAt", CURRENT_TIMESTAMP)
FROM owners
LEFT JOIN "AccountSettings" settings ON settings."ownerId" = owners."ownerId";

WITH owners AS (
    SELECT "ownerId" FROM "Client"
    UNION SELECT "ownerId" FROM "Group"
    UNION SELECT "ownerId" FROM "Campaign"
    UNION SELECT "ownerId" FROM "AccountSettings"
)
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt", "updatedAt")
SELECT
    'wm_' || md5(owners."ownerId"),
    'ws_' || md5(owners."ownerId"),
    owners."ownerId",
    'OWNER',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM owners;

ALTER TABLE "Client" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Group" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "workspaceId" TEXT;

UPDATE "Client" SET "workspaceId" = 'ws_' || md5("ownerId");
UPDATE "Group" SET "workspaceId" = 'ws_' || md5("ownerId");
UPDATE "Campaign" SET "workspaceId" = 'ws_' || md5("ownerId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Client" WHERE "workspaceId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Group" WHERE "workspaceId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Campaign" WHERE "workspaceId" IS NULL) THEN
    RAISE EXCEPTION 'Workspace backfill left business records without ownership';
  END IF;
END $$;

ALTER TABLE "Client" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Group" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX "Client_ownerId_phoneNormalized_key";
DROP INDEX "Client_ownerId_idx";
DROP INDEX "Group_ownerId_idx";
DROP INDEX "Campaign_ownerId_idx";

ALTER TABLE "Client" DROP COLUMN "ownerId";
ALTER TABLE "Group" DROP COLUMN "ownerId";
ALTER TABLE "Campaign" DROP COLUMN "ownerId";
DROP TABLE "AccountSettings";

CREATE UNIQUE INDEX "Client_workspaceId_phoneNormalized_key" ON "Client"("workspaceId", "phoneNormalized");
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");
CREATE INDEX "Group_workspaceId_idx" ON "Group"("workspaceId");
CREATE INDEX "Campaign_workspaceId_idx" ON "Campaign"("workspaceId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
