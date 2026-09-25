"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/authorization";
import { WorkspaceValidationError, updateWorkspace } from "@/lib/workspace-repository";

export async function updateWorkspaceSettingsAction(formData: FormData) {
  try {
    const context = await getAuthorizationContext();
    await updateWorkspace(context, { name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? "") });
    revalidatePath("/"); revalidatePath("/configuracion");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof WorkspaceValidationError ? error.message : "No se pudo guardar la configuración." };
  }
}
