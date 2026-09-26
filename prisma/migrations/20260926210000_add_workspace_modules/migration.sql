CREATE TABLE "WorkspaceModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceModule_workspaceId_key_key"
ON "WorkspaceModule"("workspaceId", "key");

CREATE INDEX "WorkspaceModule_workspaceId_enabled_idx"
ON "WorkspaceModule"("workspaceId", "enabled");

ALTER TABLE "WorkspaceModule"
ADD CONSTRAINT "WorkspaceModule_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceModule" ("id", "workspaceId", "key", "enabled", "createdAt", "updatedAt")
SELECT
  'wmod_' || md5(w."id" || module."key"),
  w."id",
  module."key",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (VALUES ('CAMPAIGNS'), ('TICKETS'), ('INCIDENTS')) AS module("key")
ON CONFLICT ("workspaceId", "key") DO NOTHING;
