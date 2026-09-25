"use server";

import { WorkspacePermission } from "@prisma/client";
import { AuthorizationError, getAuthorizationContext, requirePermission } from "@/lib/authorization";
import {
  sendTemplateMessage,
  sendTextMessage,
  WhatsAppApiError,
  WhatsAppInputError,
} from "@/lib/whatsapp/client";
import { PhoneNormalizationError } from "@/lib/phone";
import { WhatsAppConfigurationError } from "@/lib/whatsapp/config";

export type WhatsAppTestResult =
  | { success: true; messageId: string; to: string }
  | {
      success: false;
      error: string;
      httpStatus?: number;
      metaCode?: number;
    };

export async function sendWhatsAppTestAction(formData: FormData): Promise<WhatsAppTestResult> {
  try {
    requirePermission(await getAuthorizationContext(), WorkspacePermission.WORKSPACE_SETTINGS_EDIT);
  } catch (error) {
    return { success: false, error: error instanceof AuthorizationError ? error.message : "No tenés acceso a esta cartera." };
  }
  const type = String(formData.get("type") ?? "template");
  const to = String(formData.get("to") ?? "");

  if (type !== "template" && type !== "text") {
    return { success: false, error: "Seleccioná un tipo de mensaje válido." };
  }

  try {
    const result =
      type === "text"
        ? await sendTextMessage({
            to,
            text: String(formData.get("text") ?? ""),
          })
        : await sendTemplateMessage({
            to,
            templateName: String(formData.get("templateName") ?? ""),
            languageCode: String(formData.get("languageCode") ?? ""),
          });

    return { success: true, ...result };
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      return {
        success: false,
        error: error.message,
        httpStatus: error.httpStatus,
        metaCode: error.metaCode,
      };
    }

    if (
      error instanceof WhatsAppConfigurationError ||
      error instanceof PhoneNormalizationError ||
      error instanceof WhatsAppInputError
    ) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "No se pudo conectar con WhatsApp Cloud API. Intentá nuevamente.",
    };
  }
}
