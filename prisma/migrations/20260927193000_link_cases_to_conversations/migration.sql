-- Add a reusable, workspace-scoped link between cases and conversations.
ALTER TABLE "Case" ADD CONSTRAINT "Case_id_workspaceId_key" UNIQUE ("id", "workspaceId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_id_workspaceId_key" UNIQUE ("id", "workspaceId");

CREATE TABLE "CaseConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "createdByMemberId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseConversation_caseId_conversationId_key" ON "CaseConversation"("caseId", "conversationId");
CREATE INDEX "CaseConversation_workspaceId_conversationId_createdAt_idx" ON "CaseConversation"("workspaceId", "conversationId", "createdAt");
CREATE INDEX "CaseConversation_workspaceId_caseId_idx" ON "CaseConversation"("workspaceId", "caseId");
CREATE INDEX "CaseConversation_sourceMessageId_idx" ON "CaseConversation"("sourceMessageId");

ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_caseId_workspaceId_fkey" FOREIGN KEY ("caseId", "workspaceId") REFERENCES "Case"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "Conversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "WhatsAppMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
