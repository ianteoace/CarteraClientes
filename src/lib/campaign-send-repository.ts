import { CampaignStatus, RecipientStatus, WorkspacePermission } from "@prisma/client";

import { AuthorizationError, getClientScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export type CampaignDeliverySummary = {
  total: number;
  accepted: number;
  failed: number;
  pending: number;
};

export async function claimCampaignForSending(context: AuthorizationContext, campaignId: string) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);
  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({
      where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.READY },
      select: { id: true },
    });
    if (!campaign) return { count: 0 };

    if (!hasAllGroups(context)) {
      const [total, accessible] = await Promise.all([
        transaction.campaignRecipient.count({ where: { campaignId } }),
        transaction.campaignRecipient.count({ where: { campaignId, client: { is: getClientScopeFilter(context) } } }),
      ]);
      if (total !== accessible) {
        throw new AuthorizationError("La campaña incluye destinatarios fuera de tu acceso.");
      }
    }

    return transaction.campaign.updateMany({
      where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.READY },
      data: { status: CampaignStatus.SENDING },
    });
  });
}

export async function getCampaignPendingRecipients(context: AuthorizationContext, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId: context.workspaceId },
    select: {
      id: true,
      message: true,
      recipients: {
        where: { status: RecipientStatus.PENDING },
        select: {
          id: true,
          nameSnapshot: true,
          phoneSnapshot: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function claimRecipientForSending(context: AuthorizationContext, campaignId: string, recipientId: string) {
  return prisma.campaignRecipient.updateMany({
    where: { id: recipientId, campaignId, campaign: { workspaceId: context.workspaceId }, status: RecipientStatus.PENDING },
    data: { status: RecipientStatus.PROCESSING },
  });
}

export async function markRecipientAccepted(
  context: AuthorizationContext,
  campaignId: string,
  recipientId: string,
  providerMessageId: string,
  acceptedAt: Date,
) {
  return prisma.campaignRecipient.updateMany({
    where: { id: recipientId, campaignId, campaign: { workspaceId: context.workspaceId }, status: RecipientStatus.PROCESSING },
    data: {
      status: RecipientStatus.ACCEPTED,
      providerMessageId,
      sentAt: acceptedAt,
      failedAt: null,
      errorMessage: null,
    },
  });
}

export async function markRecipientFailed(context: AuthorizationContext, campaignId: string, recipientId: string, errorMessage: string) {
  return prisma.campaignRecipient.updateMany({
    where: { id: recipientId, campaignId, campaign: { workspaceId: context.workspaceId }, status: RecipientStatus.PROCESSING },
    data: {
      status: RecipientStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
    },
  });
}

function summarizeStatuses(statuses: RecipientStatus[]): CampaignDeliverySummary {
  return statuses.reduce<CampaignDeliverySummary>(
    (summary, status) => {
      if (
        status === RecipientStatus.ACCEPTED ||
        status === RecipientStatus.DELIVERED ||
        status === RecipientStatus.READ
      ) {
        summary.accepted += 1;
      } else if (status === RecipientStatus.FAILED) {
        summary.failed += 1;
      } else {
        summary.pending += 1;
      }

      return summary;
    },
    { total: statuses.length, accepted: 0, failed: 0, pending: 0 },
  );
}

export async function getCampaignDeliverySummary(
  context: AuthorizationContext,
  campaignId: string,
): Promise<CampaignDeliverySummary> {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, campaign: { workspaceId: context.workspaceId } },
    select: { status: true },
  });

  return summarizeStatuses(recipients.map(({ status }) => status));
}

export async function finalizeCampaignSending(context: AuthorizationContext, campaignId: string) {
  const summary = await getCampaignDeliverySummary(context, campaignId);
  let status: CampaignStatus;

  if (summary.total > 0 && summary.accepted === summary.total) {
    status = CampaignStatus.COMPLETED;
  } else if (summary.total > 0 && summary.failed === summary.total) {
    status = CampaignStatus.FAILED;
  } else {
    status = CampaignStatus.PARTIAL;
  }

  await prisma.campaign.updateMany({
    where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.SENDING },
    data: { status },
  });

  return summary;
}
