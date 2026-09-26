"use server";

import { revalidatePath } from "next/cache";

import {
  ClientValidationError,
  ClientNotFoundError,
  createClient,
  deleteClient,
  DuplicatePhoneError,
  updateClient,
  updateClientAuthorization,
  updateSelectedClientsAuthorization,
} from "@/lib/client-repository";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import {
  ContactImportError,
  importContactsFromCsv,
  previewContactImport,
  type ContactImportPreview,
  type ContactImportResult,
} from "@/lib/client-import";
import { PhoneNormalizationError } from "@/lib/phone";
import { EmailValidationError } from "@/lib/email";
import { addSelectedClientsToGroup, createGroupWithSelectedClients, GroupValidationError, removeSelectedClientsFromGroup } from "@/lib/group-repository";

export type ClientActionResult =
  | { success: true }
  | { success: false; error: string };

export type ClientImportPreviewResult =
  | { success: true; preview: ContactImportPreview }
  | { success: false; error: string };

export type ClientImportActionResult =
  | { success: true; result: ContactImportResult }
  | { success: false; error: string };

function readClientInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    optIn: formData.get("optIn") === "on",
    groupIds: formData.getAll("groupIds").map(String),
  };
}

function actionError(error: unknown): ClientActionResult {
  if (
    error instanceof ClientValidationError ||
    error instanceof DuplicatePhoneError ||
    error instanceof PhoneNormalizationError || error instanceof EmailValidationError || error instanceof AuthenticationRequiredError ||
    error instanceof AuthorizationError || error instanceof ClientNotFoundError
  ) {
    return { success: false, error: error.message };
  }

  return {
    success: false,
    error: "No se pudo guardar el cliente. Intentá nuevamente.",
  };
}

export async function createClientAction(
  formData: FormData,
): Promise<ClientActionResult> {
  try {
    await createClient(await getAuthorizationContext(), readClientInput(formData));
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateClientAction(
  id: string,
  formData: FormData,
): Promise<ClientActionResult> {
  try {
    await updateClient(await getAuthorizationContext(), id, readClientInput(formData));
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteClientAction(id: string): Promise<ClientActionResult> {
  try {
    await deleteClient(await getAuthorizationContext(), id);
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ClientNotFoundError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "No se pudo eliminar el cliente. Intentá nuevamente." };
  }
}

function getCsvFile(formData: FormData) {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new ContactImportError("Seleccioná un archivo CSV.");
  }

  return file;
}

export async function previewContactsImportAction(
  formData: FormData,
): Promise<ClientImportPreviewResult> {
  try {
    return { success: true, preview: await previewContactImport(await getAuthorizationContext(), getCsvFile(formData)) };
  } catch (error) {
    if (error instanceof ContactImportError || error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "No se pudo procesar el archivo CSV." };
  }
}

export async function importContactsAction(formData: FormData): Promise<ClientImportActionResult> {
  try {
    const groupId = String(formData.get("groupId") ?? "").trim() || undefined;
    const result = await importContactsFromCsv(await getAuthorizationContext(), getCsvFile(formData), groupId);
    revalidatePath("/clientes");
    revalidatePath("/grupos");

    if (groupId) {
      revalidatePath(`/grupos/${groupId}`);
    }

    return { success: true, result };
  } catch (error) {
    if (error instanceof ContactImportError || error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "No se pudieron importar los contactos." };
  }
}

export type BulkClientActionResult = { success: true; message: string } | { success: false; error: string };

export async function addSelectedContactsToGroupAction(groupId: string, clientIds: string[]): Promise<BulkClientActionResult> {
  try { const result = await addSelectedClientsToGroup(await getAuthorizationContext(), groupId, clientIds); revalidatePath("/clientes"); return { success: true, message: `${result.added} contactos agregados · ${result.unchanged} ya pertenecían al grupo` }; }
  catch (error) { return { success: false, error: error instanceof GroupValidationError || error instanceof AuthenticationRequiredError || error instanceof AuthorizationError ? error.message : "No se pudieron agregar los contactos." }; }
}

export async function removeSelectedContactsFromGroupAction(groupId: string, clientIds: string[]): Promise<BulkClientActionResult> {
  try { const result = await removeSelectedClientsFromGroup(await getAuthorizationContext(), groupId, clientIds); revalidatePath("/clientes"); return { success: true, message: `${result.removed} contactos quitados · ${result.unchanged} no pertenecían al grupo` }; }
  catch (error) { return { success: false, error: error instanceof GroupValidationError || error instanceof AuthenticationRequiredError || error instanceof AuthorizationError ? error.message : "No se pudieron quitar los contactos." }; }
}

export async function createGroupFromSelectedContactsAction(name: string, description: string, clientIds: string[]): Promise<BulkClientActionResult> {
  try { const group = await createGroupWithSelectedClients(await getAuthorizationContext(), { name, description }, clientIds); revalidatePath("/clientes"); revalidatePath("/grupos"); return { success: true, message: `Grupo ${group.name} creado con ${clientIds.length} contactos` }; }
  catch (error) { return { success: false, error: error instanceof GroupValidationError || error instanceof AuthenticationRequiredError || error instanceof AuthorizationError ? error.message : "No se pudo crear el grupo." }; }
}

export async function updateClientAuthorizationAction(id: string, optIn: boolean): Promise<ClientActionResult> {
  try { await updateClientAuthorization(await getAuthorizationContext(), id, optIn); revalidatePath("/clientes"); revalidatePath(`/clientes/${id}`); return { success: true }; } catch (error) { return actionError(error); }
}

export async function updateSelectedContactsAuthorizationAction(clientIds: string[], optIn: boolean): Promise<BulkClientActionResult> {
  try { const count = await updateSelectedClientsAuthorization(await getAuthorizationContext(), clientIds, optIn); revalidatePath("/clientes"); return { success: true, message: optIn ? `${count} contactos autorizados para campañas` : `${count} contactos quedaron sin autorización` }; } catch (error) { return { success: false, error: error instanceof ClientValidationError || error instanceof AuthenticationRequiredError || error instanceof AuthorizationError ? error.message : "No se pudo actualizar la autorización." }; }
}
