import "server-only";

import { WorkspacePermission } from "@prisma/client";
import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { personalizeMessage } from "@/lib/campaign-message";
import {
  claimCampaignForSending,
  claimRecipientForSending,
  finalizeCampaignSending,
  getCampaignPendingRecipients,
  markRecipientAccepted,
  markRecipientFailed,
  type CampaignExecutionContext,
} from "@/lib/campaign-send-repository";
import type { MessageProvider } from "@/lib/messaging/message-provider";
import { getMessageProvider } from "@/lib/messaging/provider-factory";

export class CampaignSendError extends Error {}

function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "El proveedor rechazó el mensaje.";
  return message.slice(0, 500);
}

export async function sendCampaign(
  context: AuthorizationContext, campaignId: string,
  provider: MessageProvider = getMessageProvider(),
) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);
  const claim = await claimCampaignForSending(context, campaignId);

  if (claim.count !== 1) {
    throw new CampaignSendError("La campaña debe estar lista y no haber sido procesada anteriormente.");
  }

  return processClaimedCampaign({
    workspaceId: context.workspaceId,
    actorUserId: context.userId,
    actorMemberId: context.memberId,
  }, campaignId, provider);
}

export async function processClaimedCampaign(
  context: CampaignExecutionContext,
  campaignId: string,
  provider: MessageProvider = getMessageProvider(),
) {

  const campaign = await getCampaignPendingRecipients(context, campaignId);

  if (!campaign) {
    return finalizeCampaignSending(context, campaignId);
  }

  for (const recipient of campaign.recipients) {
    const recipientClaim = await claimRecipientForSending(context, campaignId, recipient.id);

    if (recipientClaim.count !== 1) {
      continue;
    }

    try {
      const result = await provider.sendMessage({
        phone: recipient.phoneSnapshot,
        recipientName: recipient.nameSnapshot,
        message: personalizeMessage(campaign.message, recipient.nameSnapshot),
      });

      await markRecipientAccepted(context, campaignId, recipient.id, result.providerMessageId, result.acceptedAt);
    } catch (error) {
      await markRecipientFailed(context, campaignId, recipient.id, safeProviderError(error));
    }
  }

  return finalizeCampaignSending(context, campaignId);
}
