"use server";

import { revalidatePath } from "next/cache";
import { WorkspacePermission } from "@prisma/client";

import { getAuthorizationContext, requirePermission } from "@/lib/authorization";
import { sendConversationReply, InboxReplyError } from "@/lib/whatsapp/conversation-send-service";
import { InboxReplyValidationError } from "@/lib/whatsapp/service-window";
import { createClient, DuplicatePhoneError } from "@/lib/client-repository";
import {
  ConversationNotFoundError, getConversationDetails, linkConversationContact, linkNewlyCreatedContact,
  requireInboxAccess, setConversationArchived,
} from "@/lib/conversation-repository";

type ActionResult = { success: true } | { success: false; error: string };

function safeError(error: unknown): ActionResult {
  if (error instanceof InboxReplyError || error instanceof InboxReplyValidationError) return { success: false, error: error.message };
  if (error instanceof DuplicatePhoneError) return { success: false, error: "Ese teléfono ya existe. Buscá y vinculá el contacto existente." };
  if (error instanceof ConversationNotFoundError) return { success: false, error: "La conversación no está disponible." };
  return { success: false, error: error instanceof Error && ["ClientValidationError", "PhoneNormalizationError", "EmailValidationError", "AuthorizationError", "WorkspaceModuleError"].includes(error.name)
    ? error.message : "No se pudo completar la acción." };
}

export async function sendConversationReplyAction(
  id: string, body: string, clientRequestId: string,
): Promise<ActionResult & { status?: string }> {
  try {
    const result = await sendConversationReply(await getAuthorizationContext(), { conversationId: id, body, clientRequestId });
    revalidatePath(`/bandeja/${id}`);
    revalidatePath("/bandeja");
    return result.status === "FAILED" ? { success: false, error: "No se pudo enviar." }
      : result.status === "UNKNOWN" ? { success: false, error: "No pudimos confirmar el envío. No lo reenvíes automáticamente." }
      : { success: true, status: result.status };
  } catch (error) { return safeError(error); }
}

export async function linkConversationAction(id: string, clientId: string): Promise<ActionResult> {
  try {
    await linkConversationContact(await getAuthorizationContext(), id, clientId);
    revalidatePath(`/bandeja/${id}`);
    revalidatePath("/bandeja");
    return { success: true };
  } catch (error) { return safeError(error); }
}

export async function createContactFromConversationAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const context = await getAuthorizationContext();
    await requireInboxAccess(context, WorkspacePermission.INBOX_MANAGE);
    requirePermission(context, WorkspacePermission.CONTACT_CREATE);
    const conversation = await getConversationDetails(context, id);
    if (!conversation || conversation.clientId) throw new ConversationNotFoundError();
    const client = await createClient(context, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      company: String(formData.get("company") ?? ""),
      email: String(formData.get("email") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      optIn: false,
      groupIds: formData.getAll("groupIds").map(String),
    });
    await linkNewlyCreatedContact(context, id, client.id);
    revalidatePath(`/bandeja/${id}`);
    revalidatePath("/bandeja");
    revalidatePath("/clientes");
    return { success: true };
  } catch (error) { return safeError(error); }
}

export async function setConversationArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    await setConversationArchived(await getAuthorizationContext(), id, archived);
    revalidatePath(`/bandeja/${id}`);
    revalidatePath("/bandeja");
    return { success: true };
  } catch (error) { return safeError(error); }
}
