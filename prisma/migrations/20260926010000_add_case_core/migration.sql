-- CreateTable
CREATE TABLE "WorkspaceSequence" (
    "workspaceId" TEXT NOT NULL,
    "caseNextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkspaceSequence_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT,
    "createdByMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Case_workspaceId_number_key" ON "Case"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "Case_workspaceId_type_createdAt_idx" ON "Case"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Case_workspaceId_status_createdAt_idx" ON "Case"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Case_workspaceId_contactId_createdAt_idx" ON "Case"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_createdByMemberId_idx" ON "Case"("createdByMemberId");

-- AddForeignKey
ALTER TABLE "WorkspaceSequence" ADD CONSTRAINT "WorkspaceSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
