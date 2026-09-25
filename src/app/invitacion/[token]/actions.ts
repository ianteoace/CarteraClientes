"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/server";
import { acceptWorkspaceInvitation, InvitationValidationError } from "@/lib/invitation-repository";
import { setActiveWorkspaceCookie } from "@/lib/workspace-context";

export type AcceptInvitationResult = { success: true; alreadyMember: boolean } | { success: false; error: string };

export async function acceptInvitationAction(token: string): Promise<AcceptInvitationResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Iniciá sesión para aceptar la invitación." };
  try {
    const result = await acceptWorkspaceInvitation(token, {
      id: user.id, email: user.email, emailVerified: user.emailVerified,
    });
    await setActiveWorkspaceCookie(result.workspaceId);
    revalidatePath("/");
    revalidatePath("/equipo");
    return { success: true, alreadyMember: result.alreadyMember };
  } catch (error) {
    if (error instanceof InvitationValidationError) return { success: false, error: error.message };
    return { success: false, error: "No se pudo aceptar la invitación. Intentá nuevamente." };
  }
}
