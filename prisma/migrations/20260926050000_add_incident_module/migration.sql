ALTER TYPE "WorkspacePermission" ADD VALUE 'INCIDENT_VIEW';
ALTER TYPE "WorkspacePermission" ADD VALUE 'INCIDENT_CREATE';
ALTER TYPE "WorkspacePermission" ADD VALUE 'INCIDENT_EDIT';
ALTER TYPE "WorkspacePermission" ADD VALUE 'INCIDENT_ASSIGN';
ALTER TYPE "WorkspacePermission" ADD VALUE 'INCIDENT_RESOLVE';

CREATE TABLE "IncidentDetails" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "assignedMemberId" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncidentDetails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncidentParticipant" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "memberId" TEXT,
  "memberUserId" TEXT NOT NULL,
  "addedByMemberId" TEXT,
  "addedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncidentNote" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorMemberId" TEXT,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncidentTicket" (
  "incidentCaseId" TEXT NOT NULL,
  "ticketCaseId" TEXT NOT NULL,
  "linkedByMemberId" TEXT,
  "linkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentTicket_pkey" PRIMARY KEY ("incidentCaseId", "ticketCaseId")
);

CREATE UNIQUE INDEX "IncidentDetails_caseId_key" ON "IncidentDetails"("caseId");
CREATE INDEX "IncidentDetails_assignedMemberId_idx" ON "IncidentDetails"("assignedMemberId");
CREATE UNIQUE INDEX "IncidentParticipant_caseId_memberId_key" ON "IncidentParticipant"("caseId", "memberId");
CREATE INDEX "IncidentParticipant_memberId_idx" ON "IncidentParticipant"("memberId");
CREATE INDEX "IncidentParticipant_addedByMemberId_idx" ON "IncidentParticipant"("addedByMemberId");
CREATE INDEX "IncidentNote_caseId_createdAt_idx" ON "IncidentNote"("caseId", "createdAt");
CREATE INDEX "IncidentNote_authorMemberId_idx" ON "IncidentNote"("authorMemberId");
CREATE INDEX "IncidentTicket_ticketCaseId_idx" ON "IncidentTicket"("ticketCaseId");
CREATE INDEX "IncidentTicket_linkedByMemberId_idx" ON "IncidentTicket"("linkedByMemberId");

ALTER TABLE "IncidentDetails" ADD CONSTRAINT "IncidentDetails_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentDetails" ADD CONSTRAINT "IncidentDetails_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentParticipant" ADD CONSTRAINT "IncidentParticipant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentParticipant" ADD CONSTRAINT "IncidentParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentParticipant" ADD CONSTRAINT "IncidentParticipant_addedByMemberId_fkey" FOREIGN KEY ("addedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentTicket" ADD CONSTRAINT "IncidentTicket_incidentCaseId_fkey" FOREIGN KEY ("incidentCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentTicket" ADD CONSTRAINT "IncidentTicket_ticketCaseId_fkey" FOREIGN KEY ("ticketCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentTicket" ADD CONSTRAINT "IncidentTicket_linkedByMemberId_fkey" FOREIGN KEY ("linkedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
