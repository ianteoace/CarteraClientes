-- ExtendEnum
ALTER TYPE "WorkspacePermission" ADD VALUE 'TICKET_VIEW';
ALTER TYPE "WorkspacePermission" ADD VALUE 'TICKET_CREATE';
ALTER TYPE "WorkspacePermission" ADD VALUE 'TICKET_EDIT';
ALTER TYPE "WorkspacePermission" ADD VALUE 'TICKET_ASSIGN';
ALTER TYPE "WorkspacePermission" ADD VALUE 'TICKET_RESOLVE';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "TicketDetails" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "assignedMemberId" TEXT,
    "resolution" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketParticipant" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberUserId" TEXT NOT NULL,
    "addedByMemberId" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorMemberId" TEXT,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketDetails_caseId_key" ON "TicketDetails"("caseId");
CREATE INDEX "TicketDetails_assignedMemberId_idx" ON "TicketDetails"("assignedMemberId");
CREATE UNIQUE INDEX "TicketParticipant_caseId_memberId_key" ON "TicketParticipant"("caseId", "memberId");
CREATE INDEX "TicketParticipant_memberId_idx" ON "TicketParticipant"("memberId");
CREATE INDEX "TicketParticipant_addedByMemberId_idx" ON "TicketParticipant"("addedByMemberId");
CREATE INDEX "TicketNote_caseId_createdAt_idx" ON "TicketNote"("caseId", "createdAt");
CREATE INDEX "TicketNote_authorMemberId_idx" ON "TicketNote"("authorMemberId");

-- AddForeignKey
ALTER TABLE "TicketDetails" ADD CONSTRAINT "TicketDetails_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketDetails" ADD CONSTRAINT "TicketDetails_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_addedByMemberId_fkey" FOREIGN KEY ("addedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketNote" ADD CONSTRAINT "TicketNote_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
