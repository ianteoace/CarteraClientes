"use server";

import { revalidatePath } from "next/cache";

import { CampaignSendError, sendCampaign } from "@/lib/campaign-send-service";
import {
  CampaignNotEditableError,
  CampaignValidationError,
  createCampaign,
  createManualCampaign,
  getCampaignAudience,
  getManualCampaignAudience,
  markCampaignReady,
  updateCampaignDraft,
  updateCampaignTemplateDraft,
} from "@/lib/campaign-repository";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { MessageProviderConfigurationError } from "@/lib/messaging/provider-factory";
import { requireModule, WorkspaceModuleError } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";
import { campaignDeliveryMode, CampaignTemplateError, type CampaignMetaOptions, type CampaignTemplateSelection } from "@/lib/campaign-delivery";
import { getCampaignMetaAvailability, getCampaignTemplateCatalog } from "@/lib/campaign-template-service";
import {
  CampaignScheduleStateError,
  CampaignScheduleValidationError,
  CampaignWorkflowStartError,
  cancelScheduledCampaign,
  scheduleCampaign,
} from "@/lib/campaign-schedule-service";

export type CampaignActionResult =
  | { success: true; campaignId?: string }
  | { success: false; error: string };

function readCampaignInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    message: String(formData.get("message") ?? ""),
    sourceGroupId: String(formData.get("sourceGroupId") ?? ""),
    ...readCampaignMetaOptions(formData),
  };
}

function readCampaignMetaOptions(formData: FormData): CampaignMetaOptions {
  const deliveryMode = campaignDeliveryMode(formData.get("deliveryMode"));
  if (deliveryMode === "MOCK") return { deliveryMode };
  let mapping: unknown;
  try { mapping = JSON.parse(String(formData.get("parameterMapping") ?? "{}")); }
  catch { throw new CampaignTemplateError("Las variables de la plantilla no son válidas."); }
  return { deliveryMode, template: { connectionId: String(formData.get("connectionId") ?? ""), templateName: String(formData.get("templateName") ?? ""), language: String(formData.get("templateLanguage") ?? ""), mapping } };
}

function actionError(error: unknown): CampaignActionResult {
  if (
    error instanceof CampaignValidationError ||
    error instanceof CampaignTemplateError ||
    error instanceof CampaignNotEditableError ||
    error instanceof CampaignScheduleValidationError ||
    error instanceof CampaignScheduleStateError ||
    error instanceof CampaignWorkflowStartError ||
    error instanceof AuthorizationError ||
    error instanceof WorkspaceModuleError
  ) {
    return { success: false, error: error.message };
  }

  return {
    success: false,
    error: "No se pudo guardar la campaña. Intentá nuevamente.",
  };
}

async function getCampaignContext() {
  const context = await getAuthorizationContext();
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  return context;
}

function revalidateCampaignPaths(campaignId?: string) {
  revalidatePath("/campanas");

  if (campaignId) {
    revalidatePath(`/campanas/${campaignId}`);
  }
}

export async function getCampaignAudienceAction(groupId: string) {
  return getCampaignAudience(await getCampaignContext(), groupId);
}

export async function getManualCampaignAudienceAction(clientIds: string[]) { return getManualCampaignAudience(await getCampaignContext(), clientIds); }
export async function createManualCampaignAction(name: string, message: string, clientIds: string[], metaOptions: CampaignMetaOptions = {}): Promise<CampaignActionResult> { try { const campaign = await createManualCampaign(await getCampaignContext(), { name, message, deliveryMode: metaOptions.deliveryMode, template: metaOptions.template }, clientIds); revalidateCampaignPaths(campaign.id); return { success: true, campaignId: campaign.id }; } catch (error) { return actionError(error); } }

export async function getCampaignTemplateOptionsAction() {
  try { return { success: true as const, availability: await getCampaignMetaAvailability(await getCampaignContext()) }; }
  catch { return { success: false as const, error: "No se pudo consultar la conexión de esta cartera." }; }
}
export async function getCampaignTemplateCatalogAction(connectionId: string) {
  try { return { success: true as const, templates: await getCampaignTemplateCatalog(await getCampaignContext(), connectionId) }; }
  catch (error) { return { success: false as const, error: error instanceof CampaignTemplateError || error instanceof AuthorizationError || error instanceof WorkspaceModuleError ? error.message : "No se pudieron consultar las plantillas de WhatsApp. Revisá la conexión y los permisos de Meta." }; }
}
export async function updateCampaignTemplateDraftAction(id: string, selection: CampaignTemplateSelection): Promise<CampaignActionResult> {
  try { await updateCampaignTemplateDraft(await getCampaignContext(), id, selection); revalidateCampaignPaths(id); return { success: true }; }
  catch (error) { return actionError(error); }
}

export async function createCampaignAction(formData: FormData): Promise<CampaignActionResult> {
  try {
    const campaign = await createCampaign(await getCampaignContext(), readCampaignInput(formData));
    revalidateCampaignPaths(campaign.id);
    return { success: true, campaignId: campaign.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCampaignDraftAction(
  id: string,
  formData: FormData,
): Promise<CampaignActionResult> {
  try {
    const input = readCampaignInput(formData);
    await updateCampaignDraft(await getCampaignContext(), id, input);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function markCampaignReadyAction(id: string): Promise<CampaignActionResult> {
  try {
    await markCampaignReady(await getCampaignContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function simulateCampaignSendAction(id: string): Promise<CampaignActionResult> {
  try {
    await sendCampaign(await getCampaignContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    if (error instanceof CampaignSendError || error instanceof MessageProviderConfigurationError || error instanceof AuthorizationError || error instanceof WorkspaceModuleError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "No se pudo completar el envío de la campaña.",
    };
  }
}

export async function scheduleCampaignAction(
  id: string,
  scheduledAt: string,
  timezone: string,
): Promise<CampaignActionResult> {
  try {
    await scheduleCampaign(await getCampaignContext(), id, { scheduledAt, timezone });
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelCampaignScheduleAction(id: string): Promise<CampaignActionResult> {
  try {
    await cancelScheduledCampaign(await getCampaignContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
