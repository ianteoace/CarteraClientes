"use server";

import { GroupScopeMode, WorkspacePermission, WorkspaceRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import {
  changeMemberRole, resetMemberPermissions, setMemberPermission,
  TeamMemberNotFoundError, updateMemberGroupScope,
} from "@/lib/team-repository";

export type TeamActionResult = { success: true } | { success: false; error: string };

function actionError(error: unknown): TeamActionResult {
  if (error instanceof AuthorizationError || error instanceof TeamMemberNotFoundError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "No se pudo guardar el cambio. Intentá nuevamente." };
}

function refresh(memberId: string) {
  revalidatePath("/equipo");
  revalidatePath(`/equipo/${memberId}`);
}

export async function changeMemberRoleAction(memberId: string, role: WorkspaceRole): Promise<TeamActionResult> {
  try {
    await changeMemberRole(await getAuthorizationContext(), memberId, role);
    refresh(memberId);
    return { success: true };
  } catch (error) { return actionError(error); }
}

export async function setMemberPermissionAction(memberId: string, permission: WorkspacePermission, allowed: boolean): Promise<TeamActionResult> {
  try {
    await setMemberPermission(await getAuthorizationContext(), memberId, permission, allowed);
    refresh(memberId);
    return { success: true };
  } catch (error) { return actionError(error); }
}

export async function resetMemberPermissionsAction(memberId: string): Promise<TeamActionResult> {
  try {
    await resetMemberPermissions(await getAuthorizationContext(), memberId);
    refresh(memberId);
    return { success: true };
  } catch (error) { return actionError(error); }
}

export async function updateMemberGroupScopeAction(memberId: string, mode: GroupScopeMode, groupIds: string[]): Promise<TeamActionResult> {
  try {
    await updateMemberGroupScope(await getAuthorizationContext(), memberId, mode, groupIds);
    refresh(memberId);
    return { success: true };
  } catch (error) { return actionError(error); }
}
