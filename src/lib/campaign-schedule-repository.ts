import { CampaignStatus, WorkspacePermission } from "@prisma/client";

import { requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { assertCampaignRecipientsAccessible } from "@/lib/campaign-send-repository";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";

export type CampaignScheduleValues = {
  scheduledAt: Date;
  scheduledTimezone: string;
  scheduleGeneration: string;
};

type PreviousSchedule = {
  status: "READY" | "SCHEDULED";
  scheduledAt: Date | null;
  scheduledTimezone: string | null;
  scheduleGeneration: string | null;
  scheduledByMemberId: string | null;
  scheduledByUserId: string | null;
};

export type PreparedCampaignSchedule = CampaignScheduleValues & {
  campaignId: string;
  workspaceId: string;
  activityId: string;
  previous: PreviousSchedule;
};

export class CampaignScheduleStateError extends Error {}

export async function prepareCampaignSchedule(
  context: AuthorizationContext,
  campaignId: string,
  values: CampaignScheduleValues,
): Promise<PreparedCampaignSchedule> {
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({
      where: {
        id: campaignId,
        workspaceId: context.workspaceId,
        status: { in: [CampaignStatus.READY, CampaignStatus.SCHEDULED] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        scheduledAt: true,
        scheduledTimezone: true,
        scheduleGeneration: true,
        scheduledByMemberId: true,
        scheduledByUserId: true,
      },
    });

    if (!campaign) {
      throw new CampaignScheduleStateError("Solo se puede programar una campaña lista o reprogramar una campaña programada.");
    }

    await assertCampaignRecipientsAccessible(transaction, context, campaignId);

    const previous: PreviousSchedule = {
      status: campaign.status as PreviousSchedule["status"],
      scheduledAt: campaign.scheduledAt,
      scheduledTimezone: campaign.scheduledTimezone,
      scheduleGeneration: campaign.scheduleGeneration,
      scheduledByMemberId: campaign.scheduledByMemberId,
      scheduledByUserId: campaign.scheduledByUserId,
    };
    const update = await transaction.campaign.updateMany({
      where: {
        id: campaign.id,
        workspaceId: context.workspaceId,
        status: campaign.status,
        ...(campaign.status === CampaignStatus.SCHEDULED
          ? { scheduleGeneration: campaign.scheduleGeneration }
          : {}),
      },
      data: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: values.scheduledAt,
        scheduledTimezone: values.scheduledTimezone,
        scheduleGeneration: values.scheduleGeneration,
        scheduledByMemberId: context.memberId,
        scheduledByUserId: context.userId,
      },
    });

    if (update.count !== 1) {
      throw new CampaignScheduleStateError("La programación cambió mientras se guardaba. Actualizá la página e intentá nuevamente.");
    }

    const isReschedule = campaign.status === CampaignStatus.SCHEDULED;
    const activity = await recordActivity({
      ...activityActor(context),
      entityType: ACTIVITY_ENTITY.CAMPAIGN,
      entityId: campaign.id,
      action: isReschedule
        ? ACTIVITY_ACTION.CAMPAIGN_RESCHEDULED
        : ACTIVITY_ACTION.CAMPAIGN_SCHEDULED,
      metadata: isReschedule
        ? {
            name: campaign.name,
            from: campaign.scheduledAt?.toISOString() ?? null,
            to: values.scheduledAt.toISOString(),
            timezone: values.scheduledTimezone,
          }
        : {
            name: campaign.name,
            scheduledAt: values.scheduledAt.toISOString(),
            timezone: values.scheduledTimezone,
          },
    }, transaction);

    return {
      campaignId: campaign.id,
      workspaceId: context.workspaceId,
      activityId: activity.id,
      previous,
      ...values,
    };
  });
}

export async function compensateCampaignSchedule(prepared: PreparedCampaignSchedule) {
  return prisma.$transaction(async (transaction) => {
    const restored = await transaction.campaign.updateMany({
      where: {
        id: prepared.campaignId,
        workspaceId: prepared.workspaceId,
        status: CampaignStatus.SCHEDULED,
        scheduleGeneration: prepared.scheduleGeneration,
      },
      data: prepared.previous,
    });

    if (restored.count === 1) {
      await transaction.activity.deleteMany({
        where: { id: prepared.activityId, workspaceId: prepared.workspaceId },
      });
    }

    return restored.count === 1;
  });
}

export async function cancelCampaignSchedule(context: AuthorizationContext, campaignId: string) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_SEND);

  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({
      where: { id: campaignId, workspaceId: context.workspaceId, status: CampaignStatus.SCHEDULED },
      select: { id: true, name: true, scheduleGeneration: true },
    });
    if (!campaign) {
      throw new CampaignScheduleStateError("La campaña ya no está programada.");
    }

    await assertCampaignRecipientsAccessible(transaction, context, campaignId);

    const cancelled = await transaction.campaign.updateMany({
      where: {
        id: campaign.id,
        workspaceId: context.workspaceId,
        status: CampaignStatus.SCHEDULED,
        scheduleGeneration: campaign.scheduleGeneration,
      },
      data: {
        status: CampaignStatus.READY,
        scheduledAt: null,
        scheduledTimezone: null,
        scheduleGeneration: null,
        scheduledByMemberId: null,
        scheduledByUserId: null,
      },
    });
    if (cancelled.count !== 1) {
      throw new CampaignScheduleStateError("La programación cambió mientras se cancelaba.");
    }

    await recordActivity({
      ...activityActor(context),
      entityType: ACTIVITY_ENTITY.CAMPAIGN,
      entityId: campaign.id,
      action: ACTIVITY_ACTION.CAMPAIGN_SCHEDULE_CANCELLED,
      metadata: { name: campaign.name },
    }, transaction);
  });
}
