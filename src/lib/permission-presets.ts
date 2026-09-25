import { WorkspacePermission, WorkspaceRole } from "@prisma/client";

export const ALL_PERMISSIONS = Object.values(WorkspacePermission);

export const ROLE_PERMISSION_PRESETS: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((permission) => permission !== WorkspacePermission.PERMISSIONS_MANAGE),
  AGENT: [
    WorkspacePermission.CONTACT_VIEW,
    WorkspacePermission.CONTACT_CREATE,
    WorkspacePermission.CONTACT_EDIT,
    WorkspacePermission.GROUP_VIEW,
    WorkspacePermission.CAMPAIGN_VIEW,
  ],
  VIEWER: [
    WorkspacePermission.CONTACT_VIEW,
    WorkspacePermission.GROUP_VIEW,
    WorkspacePermission.CAMPAIGN_VIEW,
  ],
};

export function getEffectivePermissions(
  role: WorkspaceRole,
  overrides: ReadonlyArray<{ permission: WorkspacePermission; allowed: boolean }>,
) {
  if (role === WorkspaceRole.OWNER) return new Set(ALL_PERMISSIONS);

  const permissions = new Set(ROLE_PERMISSION_PRESETS[role]);
  for (const override of overrides) {
    if (override.allowed) permissions.add(override.permission);
    else permissions.delete(override.permission);
  }
  return permissions;
}
