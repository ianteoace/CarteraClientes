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
} from "@/lib/campaign-repository";
import { AuthorizationError, getAuthorizationContext } from "@/lib/authorization";
import { MessageProviderConfigurationError } from "@/lib/messaging/provider-factory";
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
  };
}

function actionError(error: unknown): CampaignActionResult {
  if (
    error instanceof CampaignValidationError ||
    error instanceof CampaignNotEditableError ||
    error instanceof CampaignScheduleValidationError ||
    error instanceof CampaignScheduleStateError ||
    error instanceof CampaignWorkflowStartError ||
    error instanceof AuthorizationError
  ) {
    return { success: false, error: error.message };
  }

  return {
    success: false,
    error: "No se pudo guardar la campaña. Intentá nuevamente.",
  };
}

function revalidateCampaignPaths(campaignId?: string) {
  revalidatePath("/campanas");

  if (campaignId) {
    revalidatePath(`/campanas/${campaignId}`);
  }
}

export async function getCampaignAudienceAction(groupId: string) {
  return getCampaignAudience(await getAuthorizationContext(), groupId);
}

export async function getManualCampaignAudienceAction(clientIds: string[]) { return getManualCampaignAudience(await getAuthorizationContext(), clientIds); }
export async function createManualCampaignAction(name: string, message: string, clientIds: string[]): Promise<CampaignActionResult> { try { const campaign = await createManualCampaign(await getAuthorizationContext(), { name, message }, clientIds); revalidateCampaignPaths(campaign.id); return { success: true, campaignId: campaign.id }; } catch (error) { return actionError(error); } }

export async function createCampaignAction(formData: FormData): Promise<CampaignActionResult> {
  try {
    const campaign = await createCampaign(await getAuthorizationContext(), readCampaignInput(formData));
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
    await updateCampaignDraft(await getAuthorizationContext(), id, input);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function markCampaignReadyAction(id: string): Promise<CampaignActionResult> {
  try {
    await markCampaignReady(await getAuthorizationContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function simulateCampaignSendAction(id: string): Promise<CampaignActionResult> {
  try {
    await sendCampaign(await getAuthorizationContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    if (error instanceof CampaignSendError || error instanceof MessageProviderConfigurationError || error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: "No se pudo completar la simulación de envío.",
    };
  }
}

export async function scheduleCampaignAction(
  id: string,
  scheduledAt: string,
  timezone: string,
): Promise<CampaignActionResult> {
  try {
    await scheduleCampaign(await getAuthorizationContext(), id, { scheduledAt, timezone });
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelCampaignScheduleAction(id: string): Promise<CampaignActionResult> {
  try {
    await cancelScheduledCampaign(await getAuthorizationContext(), id);
    revalidateCampaignPaths(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
