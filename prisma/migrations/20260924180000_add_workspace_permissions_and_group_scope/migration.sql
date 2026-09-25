CREATE TYPE "WorkspacePermission" AS ENUM (
  'CONTACT_VIEW', 'CONTACT_CREATE', 'CONTACT_EDIT', 'CONTACT_DELETE',
  'GROUP_VIEW', 'GROUP_CREATE', 'GROUP_EDIT', 'GROUP_DELETE', 'GROUP_MANAGE_MEMBERS',
  'CAMPAIGN_VIEW', 'CAMPAIGN_CREATE', 'CAMPAIGN_EDIT', 'CAMPAIGN_SEND', 'CAMPAIGN_DELETE',
  'WORKSPACE_SETTINGS_VIEW', 'WORKSPACE_SETTINGS_EDIT',
  'TEAM_VIEW', 'TEAM_MANAGE', 'PERMISSIONS_MANAGE'
);

CREATE TYPE "GroupScopeMode" AS ENUM ('ALL', 'SELECTED');

ALTER TABLE "WorkspaceMember"
  ADD COLUMN "groupScopeMode" "GroupScopeMode" NOT NULL DEFAULT 'ALL';

CREATE TABLE "MemberPermission" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "permission" "WorkspacePermission" NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberGroupAccess" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberGroupAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberPermission_memberId_permission_key" ON "MemberPermission"("memberId", "permission");
CREATE UNIQUE INDEX "MemberGroupAccess_memberId_groupId_key" ON "MemberGroupAccess"("memberId", "groupId");
CREATE INDEX "MemberGroupAccess_groupId_idx" ON "MemberGroupAccess"("groupId");

ALTER TABLE "MemberPermission" ADD CONSTRAINT "MemberPermission_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberGroupAccess" ADD CONSTRAINT "MemberGroupAccess_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberGroupAccess" ADD CONSTRAINT "MemberGroupAccess_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION enforce_member_group_workspace() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "WorkspaceMember" m
    JOIN "Group" g ON g."id" = NEW."groupId"
    WHERE m."id" = NEW."memberId" AND m."workspaceId" = g."workspaceId"
  ) THEN
    RAISE EXCEPTION 'MemberGroupAccess workspace mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MemberGroupAccess_same_workspace"
  BEFORE INSERT OR UPDATE OF "memberId", "groupId" ON "MemberGroupAccess"
  FOR EACH ROW EXECUTE FUNCTION enforce_member_group_workspace();
