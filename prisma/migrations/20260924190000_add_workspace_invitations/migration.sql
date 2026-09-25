CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "groupScopeMode" "GroupScopeMode" NOT NULL DEFAULT 'SELECTED',
    "tokenHash" TEXT NOT NULL,
    "invitedByMemberId" TEXT,
    "acceptedMemberId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "emailAttemptedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceInvitationGroupAccess" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    CONSTRAINT "WorkspaceInvitationGroupAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");
CREATE INDEX "WorkspaceInvitation_workspaceId_email_idx" ON "WorkspaceInvitation"("workspaceId", "email");
CREATE INDEX "WorkspaceInvitation_acceptedMemberId_idx" ON "WorkspaceInvitation"("acceptedMemberId");
CREATE UNIQUE INDEX "WorkspaceInvitation_one_active_email_key" ON "WorkspaceInvitation"("workspaceId", "email")
    WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "WorkspaceInvitationGroupAccess_groupId_idx" ON "WorkspaceInvitationGroupAccess"("groupId");
CREATE UNIQUE INDEX "WorkspaceInvitationGroupAccess_invitationId_groupId_key" ON "WorkspaceInvitationGroupAccess"("invitationId", "groupId");

ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedByMemberId_fkey"
    FOREIGN KEY ("invitedByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_acceptedMemberId_fkey"
    FOREIGN KEY ("acceptedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitationGroupAccess" ADD CONSTRAINT "WorkspaceInvitationGroupAccess_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "WorkspaceInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitationGroupAccess" ADD CONSTRAINT "WorkspaceInvitationGroupAccess_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
