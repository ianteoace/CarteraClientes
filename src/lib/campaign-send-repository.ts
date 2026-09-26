import { CampaignStatus, RecipientStatus, WorkspacePermission } from "@prisma/client";

import { AuthorizationError, getClientScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";

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
      select: { id: true, name: true },
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

    const result = await transaction.campaign.updateMany({
      where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.READY },
      data: { status: CampaignStatus.SENDING },
    });
    if (result.count) await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_SEND_STARTED, metadata: { name: campaign.name, provider: "mock" } }, transaction);
    return result;
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

  await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({ where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.SENDING }, select: { id: true, name: true } });
    if (!campaign) return;
    await transaction.campaign.update({ where: { id: campaign.id }, data: { status } });
    const action = status === CampaignStatus.COMPLETED ? ACTIVITY_ACTION.CAMPAIGN_COMPLETED : status === CampaignStatus.FAILED ? ACTIVITY_ACTION.CAMPAIGN_FAILED : ACTIVITY_ACTION.CAMPAIGN_PARTIAL;
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action, metadata: { name: campaign.name, provider: "mock", count: summary.total, accepted: summary.accepted, failed: summary.failed } }, transaction);
  });

  return summary;
}
