-- Reject inconsistent legacy links instead of silently losing them during backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CaseConversation" c
    LEFT JOIN "WhatsAppMessage" m ON m."id" = c."sourceMessageId"
    WHERE c."sourceMessageId" IS NOT NULL
      AND (m."id" IS NULL OR m."workspaceId" <> c."workspaceId" OR m."conversationId" <> c."conversationId" OR m."direction" <> 'INBOUND' OR m."type" <> 'TEXT')
  ) THEN
    RAISE EXCEPTION 'Existing source messages are missing or cross conversation/workspace';
  END IF;
END $$;

ALTER TABLE "CaseConversation" ADD CONSTRAINT "CaseConversation_id_workspaceId_key" UNIQUE ("id", "workspaceId");
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_id_workspaceId_key" UNIQUE ("id", "workspaceId");

CREATE TABLE "CaseConversationSourceMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "caseConversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseConversationSourceMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseConversationSourceMessage_caseConversationId_messageId_key"
  ON "CaseConversationSourceMessage"("caseConversationId", "messageId");
CREATE INDEX "CaseConversationSourceMessage_messageId_idx"
  ON "CaseConversationSourceMessage"("messageId");
CREATE INDEX "CaseConversationSourceMessage_workspaceId_caseConversationId_idx"
  ON "CaseConversationSourceMessage"("workspaceId", "caseConversationId");

ALTER TABLE "CaseConversationSourceMessage" ADD CONSTRAINT "CaseConversationSourceMessage_caseConversationId_workspaceId_fkey"
  FOREIGN KEY ("caseConversationId", "workspaceId") REFERENCES "CaseConversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseConversationSourceMessage" ADD CONSTRAINT "CaseConversationSourceMessage_messageId_workspaceId_fkey"
  FOREIGN KEY ("messageId", "workspaceId") REFERENCES "WhatsAppMessage"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CaseConversationSourceMessage" ("id", "workspaceId", "caseConversationId", "messageId", "createdAt")
SELECT 'csm_' || md5(c."id" || ':' || c."sourceMessageId"), c."workspaceId", c."id", c."sourceMessageId", c."createdAt"
FROM "CaseConversation" c
WHERE c."sourceMessageId" IS NOT NULL;

-- Keep the legacy column temporarily so the currently deployed application remains
-- compatible while the new application is rolled out. New writes use only this table.
