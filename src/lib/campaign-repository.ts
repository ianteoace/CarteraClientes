import { CampaignStatus, RecipientStatus, WorkspacePermission } from "@prisma/client";

import { getClientScopeFilter, getGroupScopeFilter, hasAllGroups, requirePermission, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, ACTIVITY_ENTITY } from "@/lib/activity-types";
import { activityActor, recordActivity } from "@/lib/activity-service";
import { analyzeTemplate, campaignDeliveryMode, CampaignTemplateError, resolveTemplateParameters, validateMapping, type CampaignMetaOptions, type CampaignTemplateSnapshot } from "@/lib/campaign-delivery";
import { prepareCampaignTemplate } from "@/lib/campaign-template-service";
import { formatPhoneForWhatsApp } from "@/lib/whatsapp/phone";
import { assertCampaignRecipientsAccessible } from "@/lib/campaign-send-repository";
import { requireModule } from "@/lib/workspace-module-service";
import { WORKSPACE_MODULE } from "@/lib/workspace-modules";

export type CampaignInput = CampaignMetaOptions & {
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
  clients: Array<{ id: string; name: string; phone: string; company: string | null; email?: string | null }>;
};

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  sourceGroupName: string | null;
  recipientCount: number;
  createdAt: string;
  scheduledAt: string | null;
  scheduledTimezone: string | null;
  deliveryMode: string;
};

export type CampaignRecipientItem = {
  id: string;
  nameSnapshot: string;
  phoneSnapshot: string;
  status: RecipientStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  templateParameters: unknown;
  updatedAt: string;
};

export type CampaignDetails = {
  id: string;
  name: string;
  message: string;
  status: CampaignStatus;
  deliveryMode: string;
  whatsAppTemplate: Omit<CampaignTemplateSnapshot, "metaTemplateId"> | null;
  sourceGroupName: string | null;
  recipients: CampaignRecipientItem[];
  recipientCount: number;
  deliverySummary: {
    total: number;
    accepted: number;
    failed: number;
    pending: number;
    delivered: number;
    read: number;
  };
  scheduledAt: string | null;
  scheduledTimezone: string | null;
};

export class CampaignValidationError extends Error {}
export class CampaignNotEditableError extends Error {}

export async function getManualCampaignAudience(context: AuthorizationContext, clientIds: string[]) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  requirePermission(context, WorkspacePermission.CONTACT_VIEW);
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) throw new CampaignValidationError("Seleccioná al menos un contacto.");
  const clients = await prisma.client.findMany({ where: { id: { in: ids }, ...getClientScopeFilter(context) }, select: { id: true, name: true, phone: true, company: true, email: true, optIn: true } });
  if (clients.length !== ids.length) throw new CampaignValidationError("No tenés acceso a uno de los contactos seleccionados.");
  return { selectedCount: ids.length, eligibleCount: clients.filter((client) => client.optIn).length, excludedCount: clients.filter((client) => !client.optIn).length, clients: clients.filter((client) => client.optIn) };
}

export async function createManualCampaign(context: AuthorizationContext, input: Pick<CampaignInput, "name" | "message"> & CampaignMetaOptions, clientIds: string[]) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const delivery = await draftDelivery(context.workspaceId, input);
  const data = normalizeDraftInput({ ...input, message: delivery.body ?? input.message });
  const audience = await getManualCampaignAudience(context, clientIds);
  if (!audience.eligibleCount) throw new CampaignValidationError("Ninguno de los contactos seleccionados está autorizado para campañas.");
  return prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.create({ data: { ...data, ...delivery.data, workspaceId: context.workspaceId, sourceGroupId: null, recipients: { create: audience.clients.map((client) => ({ clientId: client.id, nameSnapshot: client.name, phoneSnapshot: client.phone })) } } });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_CREATED, metadata: { name: campaign.name, recipientCount: audience.eligibleCount } }, transaction);
    return campaign;
  });
}

async function draftDelivery(workspaceId: string, input: CampaignMetaOptions) {
  const deliveryMode = campaignDeliveryMode(input.deliveryMode);
  if (deliveryMode === "MOCK") return { body: undefined, data: { deliveryMode } };
  if (!input.template) throw new CampaignTemplateError("Seleccioná una plantilla aprobada para WhatsApp real.");
  const prepared = await prepareCampaignTemplate(workspaceId, input.template);
  return { body: prepared.body, data: { deliveryMode, whatsAppTemplate: { create: prepared.snapshot } } };
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
              email: true,
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
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_CREATE);
  const delivery = await draftDelivery(context.workspaceId, input);
  const data = normalizeCampaignInput({ ...input, message: delivery.body ?? input.message });

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
        ...delivery.data,
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
      deliveryMode: true,
      createdAt: true,
      scheduledAt: true,
      scheduledTimezone: true,
      sourceGroup: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    deliveryMode: campaign.deliveryMode,
    sourceGroupName: campaign.sourceGroup?.name ?? null,
    recipientCount: campaign._count.recipients,
    createdAt: campaign.createdAt.toISOString(),
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    scheduledTimezone: campaign.scheduledTimezone,
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
      deliveryMode: true,
      whatsAppTemplate: { select: { whatsappConnectionId: true, templateName: true, language: true, category: true, componentsSnapshot: true, parameterMapping: true } },
      scheduledAt: true,
      scheduledTimezone: true,
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
          templateParameters: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
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
      if (status === RecipientStatus.DELIVERED || status === RecipientStatus.READ) summary.delivered += _count._all;
      if (status === RecipientStatus.READ) summary.read += _count._all;
      return summary;
    },
    { total: 0, accepted: 0, failed: 0, pending: 0, delivered: 0, read: 0 },
  );
  if (campaign.deliveryMode === "META_WHATSAPP") {
    // Dispatch acceptance is independent of a later delivery failure.
    deliverySummary.accepted = await prisma.campaignRecipient.count({ where: { campaignId: id, OR: [
      { dispatchAcceptedAt: { not: null } }, { status: { in: ["ACCEPTED", "DELIVERED", "READ"] } },
    ] } });
  }

  return {
    id: campaign.id,
    name: campaign.name,
    message: campaign.message,
    status: campaign.status,
    deliveryMode: campaign.deliveryMode,
    whatsAppTemplate: campaign.whatsAppTemplate,
    sourceGroupName: campaign.sourceGroup?.name ?? null,
    recipients: campaign.recipients.map((recipient) => ({ ...recipient, providerMessageId: campaign.deliveryMode === "META_WHATSAPP" ? null : recipient.providerMessageId, updatedAt: (recipient.readAt ?? recipient.deliveredAt ?? recipient.failedAt ?? recipient.sentAt)?.toISOString() ?? "" })),
    recipientCount: deliverySummary.total,
    deliverySummary,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    scheduledTimezone: campaign.scheduledTimezone,
  };
}

export async function updateCampaignDraft(
  context: AuthorizationContext, id: string,
  input: Pick<CampaignInput, "name" | "message">,
) {
  requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const data = normalizeDraftInput(input);
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: CampaignStatus.DRAFT }, select: { id: true, name: true, message: true, deliveryMode: true } });
    if (!current) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
    if (current.deliveryMode === "META_WHATSAPP") data.message = current.message;
    const changedFields = (["name", "message"] as const).filter((field) => current[field] !== data[field]);
    if (!changedFields.length) return;
    const changed = await transaction.campaign.updateMany({ where: { id: current.id, workspaceId: context.workspaceId, status: "DRAFT" }, data });
    if (changed.count !== 1) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: current.id, action: ACTIVITY_ACTION.CAMPAIGN_UPDATED, metadata: { name: data.name, changedFields } }, transaction);
  });
}

export async function markCampaignReady(context: AuthorizationContext, id: string) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const initial = await prisma.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: CampaignStatus.DRAFT }, include: { whatsAppTemplate: true } });
  if (!initial) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
  const mode = campaignDeliveryMode(initial.deliveryMode);
  let prepared: Awaited<ReturnType<typeof prepareCampaignTemplate>> | undefined;
  if (mode === "META_WHATSAPP") {
    const snapshot = initial.whatsAppTemplate;
    if (!snapshot?.whatsappConnectionId) throw new CampaignTemplateError("La conexión de la plantilla ya no está disponible.");
    prepared = await prepareCampaignTemplate(context.workspaceId, { connectionId: snapshot.whatsappConnectionId, templateName: snapshot.templateName, language: snapshot.language, mapping: snapshot.parameterMapping });
    if (snapshot.metaTemplateId && snapshot.metaTemplateId !== prepared.snapshot.metaTemplateId) throw new CampaignTemplateError("La plantilla fue reemplazada en Meta. Revisá el borrador.");
  }
  await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: CampaignStatus.DRAFT }, select: { id: true, name: true } });
    if (!campaign) throw new CampaignNotEditableError("La campaña ya no está en borrador.");
    await assertCampaignRecipientsAccessible(transaction, context, id);
    const claim = await transaction.campaign.updateMany({ where: { id, workspaceId: context.workspaceId, status: "DRAFT", updatedAt: initial.updatedAt }, data: { status: "READY", ...(prepared ? { message: prepared.body } : {}) } });
    if (claim.count !== 1) throw new CampaignNotEditableError("El borrador cambió mientras se preparaba. Revisalo e intentá nuevamente.");
    if (prepared) {
      const recipients = await transaction.campaignRecipient.findMany({ where: { campaignId: id }, select: { id: true, clientId: true, phoneSnapshot: true } });
      if (!recipients.length) throw new CampaignTemplateError("La campaña no tiene destinatarios.");
      const clients = await transaction.client.findMany({ where: { id: { in: recipients.flatMap((recipient) => recipient.clientId ? [recipient.clientId] : []) }, ...getClientScopeFilter(context) }, select: { id: true, name: true, phone: true, company: true, email: true, optIn: true } });
      const byId = new Map(clients.map((client) => [client.id, client]));
      const analysis = analyzeTemplate({ category: prepared.snapshot.category, components: prepared.snapshot.componentsSnapshot as unknown[] });
      const mapping = validateMapping(prepared.snapshot.parameterMapping, analysis.variables);
      const parameters = recipients.map((recipient) => {
        const client = recipient.clientId ? byId.get(recipient.clientId) : undefined;
        if (!client?.optIn) throw new CampaignTemplateError("Todos los destinatarios deben existir y estar autorizados al preparar la campaña.");
        try { if (!/^[1-9]\d{7,14}$/.test(formatPhoneForWhatsApp(recipient.phoneSnapshot, "internal"))) throw new Error(); } catch { throw new CampaignTemplateError("Un destinatario tiene un teléfono inválido para WhatsApp."); }
        return { id: recipient.id, parameters: resolveTemplateParameters(mapping, analysis.variables, client) };
      });
      await transaction.$executeRaw`UPDATE "CampaignRecipient" AS recipient SET "templateParameters" = snapshot.parameters
        FROM jsonb_to_recordset(${JSON.stringify(parameters)}::jsonb) AS snapshot(id text, parameters jsonb)
        WHERE recipient.id = snapshot.id AND recipient."campaignId" = ${id}`;
      await transaction.campaignWhatsAppTemplate.update({ where: { campaignId: id }, data: prepared.snapshot });
    }
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: campaign.id, action: ACTIVITY_ACTION.CAMPAIGN_READY, metadata: { name: campaign.name } }, transaction);
  });
}

export async function updateCampaignTemplateDraft(context: AuthorizationContext, id: string, selection: NonNullable<CampaignMetaOptions["template"]>) {
  await requireModule(context, WORKSPACE_MODULE.CAMPAIGNS);
  requirePermission(context, WorkspacePermission.CAMPAIGN_EDIT);
  const current = await prisma.campaign.findFirst({ where: { id, workspaceId: context.workspaceId, status: "DRAFT", deliveryMode: "META_WHATSAPP" } });
  if (!current) throw new CampaignNotEditableError("La plantilla solo puede editarse mientras la campaña esté en borrador.");
  const prepared = await prepareCampaignTemplate(context.workspaceId, selection);
  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.campaign.updateMany({ where: { id, workspaceId: context.workspaceId, status: "DRAFT", updatedAt: current.updatedAt }, data: { message: prepared.body } });
    if (changed.count !== 1) throw new CampaignNotEditableError("El borrador cambió. Revisalo antes de guardar.");
    await transaction.campaignWhatsAppTemplate.upsert({ where: { campaignId: id }, create: { campaignId: id, ...prepared.snapshot }, update: prepared.snapshot });
    await recordActivity({ ...activityActor(context), entityType: ACTIVITY_ENTITY.CAMPAIGN, entityId: id, action: ACTIVITY_ACTION.CAMPAIGN_UPDATED, metadata: { name: current.name, changedFields: ["template"] } }, transaction);
  });
}
