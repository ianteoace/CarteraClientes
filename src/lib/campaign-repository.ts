import { CampaignStatus, RecipientStatus, WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";

export type CampaignInput = {
  name: string;
  message: string;
  sourceGroupId: string;
};

export type CampaignSourceGroup = {
  id: string;
  name: string;
  memberCount: number;
  eligibleCount: number;
};

export type CampaignAudience = {
  groupId: string;
  memberCount: number;
  eligibleCount: number;
  clients: Array<{ id: string; name: string; phone: string; company: string | null }>;
};

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  sourceGroupName: string | null;
  recipientCount: number;
  createdAt: string;
};

export type CampaignRecipientItem = {
  id: string;
  nameSnapshot: string;
  phoneSnapshot: string;
  status: RecipientStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
};

export type CampaignDetails = {
  id: string;
  name: string;
  message: string;
  status: CampaignStatus;
  sourceGroupName: string | null;
  recipients: CampaignRecipientItem[];
  recipientCount: number;
  deliverySummary: {
    total: number;
    accepted: number;
    failed: number;
    pending: number;
  };
};

export class CampaignValidationError extends Error {}
export class CampaignNotEditableError extends Error {}

export async function getManualCampaignAudience(context: AuthorizationContext, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) throw new CampaignValidationError("Seleccioná al menos un contacto.");
  const clients = await prisma.client.findMany({ where: { id: { in: ids }, ...getClientScopeFilter(context) }, select: { id: true, name: true, phone: true, company: true, optIn: true } });
  if (clients.length !== ids.length) throw new CampaignValidationError("No tenés acceso a uno de los contactos seleccionados.");
  return { selectedCount: ids.length, eligibleCount: clients.filter((client) => client.optIn).length, excludedCount: clients.filter((client) => !client.optIn).length, clients: clients.filter((client) => client.optIn) };
}

export async function createManualCampaign(context: AuthorizationContext, input: Pick<CampaignInput, "name" | "message">, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const data = normalizeDraftInput(input);
  const audience = await getManualCampaignAudience(context, clientIds);
  if (!audience.eligibleCount) throw new CampaignValidationError("Ninguno de los contactos seleccionados está autorizado para campañas.");
  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.create({ data: { ...data, workspaceId: context.workspaceId, sourceGroupId: null, recipients: { create: audience.clients.map((client) => ({ clientId: client.id, nameSnapshot: client.name, phoneSnapshot: client.phone })) } } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_CREATED, metadata: { name: campaign.name, recipientCount: audience.eligibleCount } }, transaction);
    return campaign;
  });
}

function normalizeCampaignInput(input: CampaignInput) {
  const name = input.name.trim();
  const message = input.message.trim();
  const sourceGroupId = input.sourceGroupId.trim();

  if (!name) {
    throw new CampaignValidationError("El nombre de la campaña es obligatorio.");
  }

  if (!message) {
    throw new CampaignValidationError("El mensaje es obligatorio.");
  }

  if (!sourceGroupId) {
    throw new CampaignValidationError("Seleccioná un grupo de origen.");
  }

  return { name, message, sourceGroupId };
}

function normalizeDraftInput(input: Pick<CampaignInput, "name" | "message">) {
  const name = input.name.trim();
  const message = input.message.trim();

  if (!name) {
    throw new CampaignValidationError("El nombre de la campaña es obligatorio.");
  }

  if (!message) {
    throw new CampaignValidationError("El mensaje es obligatorio.");
  }

  return { name, message };
}

export async function listCampaignSourceGroups(context: AuthorizationContext): Promise<CampaignSourceGroup[]> {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const groups = await prisma.group.findMany({
    where: getGroupScopeFilter(context),
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          clientGroups: true,
        },
      },
      clientGroups: {
        where: { client: { optIn: true } },
        select: { clientId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    memberCount: group._count.clientGroups,
    eligibleCount: group.clientGroups.length,
  }));
}

export async function getCampaignAudience(context: AuthorizationContext, groupId: string): Promise<CampaignAudience | null> {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const group = await prisma.group.findFirst({
    where: { id: groupId, ...getGroupScopeFilter(context) },
    select: {
      id: true,
      _count: { select: { clientGroups: true } },
      clientGroups: {
        where: { client: { optIn: true } },
        select: {
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
              company: true,
            },
          },
        },
        orderBy: { client: { name: "asc" } },
      },
    },
  });

  if (!group) {
    return null;
  }

  return {
    groupId: group.id,
    memberCount: group._count.clientGroups,
    eligibleCount: group.clientGroups.length,
    clients: group.clientGroups.map(({ client }) => client),
  };
}

export async function createCampaign(context: AuthorizationContext, input: CampaignInput) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const data = normalizeCampaignInput(input);

  return prisma.$transaction(async (transaction) => {
    const audience = await transaction.group.findFirst({
      where: { id: data.sourceGroupId, ...getGroupScopeFilter(context) },
      select: {
        clientGroups: {
          where: { client: { optIn: true } },
          select: {
            client: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
    });

    if (!audience) {
      throw new CampaignValidationError("El grupo seleccionado ya no existe.");
    }

    if (audience.clientGroups.length === 0) {
      throw new CampaignValidationError("El grupo no tiene clientes con opt-in habilitado.");
    }

    const campaign = await transaction.campaign.create({
      data: {
        ...data, workspaceId: context.workspaceId,
        recipients: {
          create: audience.clientGroups.map(({ client }) => ({
            clientId: client.id,
            nameSnapshot: client.name,
            phoneSnapshot: client.phone,
          })),
        },
      },
    });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_CREATED, metadata: { name: campaign.name, recipientCount: audience.clientGroups.length } }, transaction);
    return campaign;
  });
}

export async function listCampaigns(context: AuthorizationContext): Promise<CampaignListItem[]> {
  requirePermission(context, WorkspacePermission.CAMPAIGN_VIEW);
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: context.workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      sourceGroup: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    sourceGroupName: campaign.sourceGroup?.name ?? null,
    recipientCount: campaign._count.recipients,
    createdAt: campaign.createdAt.toISOString(),
  }));
}

export async function getCampaignDetails(context: AuthorizationContext, id: string): Promise<CampaignDetails | null> {
  requirePermission(context, WorkspacePermission.CAMPAIGN_VIEW);
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: {
      id: true,
      name: true,
      message: true,
      status: true,
      sourceGroup: { select: { name: true } },
      recipients: {
        ...(!hasAllGroups(context) ? {
          where: { clientId: { not: null }, client: { is: getClientScopeFilter(context) } },
        } : {}),
        select: {
          id: true,
          nameSnapshot: true,
          phoneSnapshot: true,
          status: true,
          providerMessageId: true,
          errorMessage: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) {
    return null;
  }

  const statusCounts = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: campaign.id },
    _count: { _all: true },
  });
  const deliverySummary = statusCounts.reduce(
    (summary, { status, _count }) => {
      if (
        status === RecipientStatus.ACCEPTED ||
        status === RecipientStatus.DELIVERED ||
        status === RecipientStatus.READ
      ) {
        summary.accepted += _count._all;
      } else if (status === RecipientStatus.FAILED) {
        summary.failed += _count._all;
      } else {
        summary.pending += _count._all;
      }
      summary.total += _count._all;
      return summary;
    },
    { total: 0, accepted: 0, failed: 0, pending: 0 },
  );

  return {
    id: campaign.id,
    name: campaign.name,
    message: campaign.message,
    status: campaign.status,
    sourceGroupName: campaign.sourceGroup?.name ?? null,
    recipients: campaign.recipients,
    recipientCount: deliverySummary.total,
    deliverySummary,
  };
}

export async function updateCampaignDraft(
  context: AuthorizationContext, id: string,
  input: Pick<CampaignInput, "name" | "message">,
) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const data = normalizeDraftInput(input);
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: CampaignStatus.DRAFT }, select: { id: true, name: true, message: true } });
    if (!current) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
    const changedFields = (["name", "message"] as const).filter((field) => current[field] !== data[field]);
    if (!changedFields.length) return;
    const campaign = await transaction.campaign.update({ where: { id: current.id }, data });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_UPDATED, metadata: { name: campaign.name, changedFields } }, transaction);
  });
}

export async function markCampaignReady(context: AuthorizationContext, id: string) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: CampaignStatus.DRAFT }, select: { id: true, name: true } });
    if (!campaign) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
    await transaction.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.READY } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_READY, metadata: { name: campaign.name } }, transaction);
  });
}
