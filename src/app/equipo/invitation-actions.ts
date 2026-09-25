"use server";

import { GroupScopeMode, WorkspaceRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/auth/server";
import {
  createWorkspaceInvitation, deliverWorkspaceInvitation, InvitationValidationError,
  resendWorkspaceInvitation, revokeWorkspaceInvitation,
} from "@/lib/invitation-repository";

export type InvitationActionResult = { success: true; emailSent?: boolean } | { success: false; error: string };

function actionError(error: unknown): InvitationActionResult {
  if (error instanceof AuthorizationError || error instanceof InvitationValidationError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

export async function createInvitationAction(formData: FormData): Promise<InvitationActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Iniciá sesión para invitar miembros." };
    const issue = await createWorkspaceInvitation(await getAuthorizationContext(), {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "") as WorkspaceRole,
      groupScopeMode: String(formData.get("groupScopeMode") ?? "SELECTED") as GroupScopeMode,
      groupIds: formData.getAll("groupIds").map(String),
    }, user.email);
    const emailSent = await deliverWorkspaceInvitation(issue, user.name || user.email);
    revalidatePath("/equipo");
    return { success: true, emailSent };
  } catch (error) { return actionError(error); }
}

export async function resendInvitationAction(invitationId: string): Promise<InvitationActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Iniciá sesión para reenviar invitaciones." };
    const issue = await resendWorkspaceInvitation(await getAuthorizationContext(), invitationId);
    const emailSent = await deliverWorkspaceInvitation(issue, user.name || user.email);
    revalidatePath("/equipo");
    return { success: true, emailSent };
  } catch (error) { return actionError(error); }
}

export async function revokeInvitationAction(invitationId: string): Promise<InvitationActionResult> {
  try {
    await revokeWorkspaceInvitation(await getAuthorizationContext(), invitationId);
    revalidatePath("/equipo");
    return { success: true };
  } catch (error) { return actionError(error); }
}
