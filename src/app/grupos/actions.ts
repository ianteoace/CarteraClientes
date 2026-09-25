"use server";

import { revalidatePath } from "next/cache";

import {
  addClientsToGroup,
  createGroup,
  deleteGroup,
  GroupValidationError,
  removeClientFromGroup,
  updateGroup,
} from "@/lib/group-repository";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";

export type GroupActionResult =
  | { success: true; added?: number }
  | { success: false; error: string };

function readGroupInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
}

function actionError(error: unknown): GroupActionResult {
  if (error instanceof GroupValidationError || error instanceof AuthorizationError) {
    return { success: false, error: error.message };
  }

  return {
    success: false,
    error: "No se pudo guardar el grupo. Intentá nuevamente.",
  };
}

function revalidateGroupPaths(groupId?: string) {
  revalidatePath("/grupos");

  if (groupId) {
    revalidatePath(`/grupos/${groupId}`);
  }
}

export async function createGroupAction(formData: FormData): Promise<GroupActionResult> {
  try {
    await createGroup(await getAuthorizationContext(), readGroupInput(formData));
    revalidateGroupPaths();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateGroupAction(
  id: string,
  formData: FormData,
): Promise<GroupActionResult> {
  try {
    await updateGroup(await getAuthorizationContext(), id, readGroupInput(formData));
    revalidateGroupPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteGroupAction(id: string): Promise<GroupActionResult> {
  try {
    await deleteGroup(await getAuthorizationContext(), id);
    revalidateGroupPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function addClientsToGroupAction(
  groupId: string,
  clientIds: string[],
): Promise<GroupActionResult> {
  try {
    const result = await addClientsToGroup(await getAuthorizationContext(), groupId, clientIds);
    revalidateGroupPaths(groupId);

    if (result.count === 0) {
      return {
        success: false,
        error: "Los clientes seleccionados ya pertenecen al grupo.",
      };
    }

    return { success: true, added: result.count };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeClientFromGroupAction(
  groupId: string,
  clientId: string,
): Promise<GroupActionResult> {
  try {
    await removeClientFromGroup(await getAuthorizationContext(), groupId, clientId);
    revalidateGroupPaths(groupId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
